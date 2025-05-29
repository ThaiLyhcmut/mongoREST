import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { 
  scriptsRouteConfig,
  ScriptOptions,
  ScriptBody,
  BatchScriptData,
  BatchScriptBody,
  ParsedScript,
  ScriptExecutionResult,
  PermissionCheck,
  ScriptHistoryQuery,
  ScriptHistoryItem
} from '../config/route.scripts.config.js';

// Script execution routes - Execute raw MongoDB scripts
async function scriptRoutes(fastify: FastifyInstance, options: any): Promise<void> {
  const { schemaLoader, dbManager, authManager, scriptParser } = fastify as any;

  // Helper methods
  const getOperationType = (operation: string): string => {
    // Map MongoDB operations to permission types
    const operationMap: { [key: string]: string } = {
      find: 'read',
      findOne: 'read',
      insertOne: 'create',
      insertMany: 'create',
      updateOne: 'update',
      updateMany: 'update',
      deleteOne: 'delete',
      deleteMany: 'delete',
      replaceOne: 'update',
      aggregate: 'read'
    };
    
    return operationMap[operation] || 'read';
  };

  const executeMongoOperation = async (parsed: ParsedScript, options: ScriptOptions = {}): Promise<any> => {
    // This would contain the actual MongoDB operation execution logic
    // For now, return a mock result
    return { message: 'Operation executed successfully', operation: parsed.operation };
  };

  const executeExplain = async (parsed: ParsedScript, startTime: number): Promise<any> => {
    // Execute explain plan for the operation
    return {
      success: true,
      explain: {
        operation: parsed.operation,
        collection: parsed.collection,
        executionStats: {
          totalDocsExamined: 0,
          totalDocsReturned: 0,
          executionTimeMillis: Date.now() - startTime
        }
      },
      meta: {
        operation: parsed.operation,
        collection: parsed.collection,
        executionTime: `${Date.now() - startTime}ms`,
        explain: true
      }
    };
  };

  const getRecordsAffected = (result: any, operation: string): number => {
    // Extract records affected based on operation type
    if (result.modifiedCount !== undefined) return result.modifiedCount;
    if (result.deletedCount !== undefined) return result.deletedCount;
    if (result.insertedCount !== undefined) return result.insertedCount;
    if (Array.isArray(result)) return result.length;
    return 0;
  };

  const generateScriptSuggestions = (parsed: ParsedScript): string[] => {
    const suggestions: string[] = [];
    
    if (parsed.operation === 'find' && !parsed.params.limit) {
      suggestions.push('Consider adding a limit to your query for better performance');
    }
    
    if (parsed.operation.includes('update') && !parsed.params.filter) {
      suggestions.push('Be careful with update operations without filters');
    }
    
    return suggestions;
  };

  const generateScriptWarnings = (parsed: ParsedScript): string[] => {
    const warnings: string[] = [];
    
    if (parsed.meta.complexity > 3) {
      warnings.push('High complexity script detected - may impact performance');
    }
    
    if (parsed.operation.includes('delete') && !parsed.params.filter) {
      warnings.push('Delete operation without filter will remove all documents');
    }
    
    return warnings;
  };  // Execute raw MongoDB script
  fastify.post<{ Body: ScriptBody }>('/execute', {
    ...scriptsRouteConfig.execute,
    preHandler: [
      (fastify as any).authenticate,
      (fastify as any).parseMongoScript(),
      (fastify as any).validateScript(),
      (fastify as any).scriptRateLimit(),
      (fastify as any).logScriptExecution(),
      (fastify as any).analyzeScript()
    ]
  }, async (request: FastifyRequest<{ Body: ScriptBody }>, reply: FastifyReply) => {
    try {
      const startTime = Date.now();
      const { options = {} } = request.body;
      const parsed = request.parsedScript!;
      
      // Handle dry run
      if (options.dryRun) {
        return {
          success: true,
          dryRun: true,
          parsed: {
            collection: parsed.collection,
            operation: parsed.operation,
            parameters: parsed.params,
            originalScript: parsed.meta.originalScript,
            complexity: parsed.meta.complexity
          },
          meta: {
            operation: parsed.operation,
            collection: parsed.collection,
            executionTime: `${Date.now() - startTime}ms`,
            dryRun: true
          }
        };
      }

      // Handle explain
      if (options.explain) {
        return await executeExplain(parsed, startTime);
      }

      // Execute the parsed script
      const result = await executeMongoOperation(parsed, options);
      
      const executionTime = Date.now() - startTime;
      
      return {
        success: true,
        data: result,
        script: {
          original: parsed.meta.originalScript,
          parsed: scriptParser.parametersToScript(parsed.collection, parsed.operation, parsed.params),
          complexity: parsed.meta.complexity,
          collections: parsed.meta.collections
        },
        analysis: request.scriptAnalysis,
        meta: {
          operation: parsed.operation,
          collection: parsed.collection,
          executionTime: `${executionTime}ms`,
          recordsAffected: getRecordsAffected(result, parsed.operation)
        }
      };

    } catch (error: any) {
      fastify.log.error('Script execution failed:', error);
      
      return reply.code(500).send({
        success: false,
        error: error.message,
        script: {
          original: request.parsedScript?.meta.originalScript,
          complexity: request.parsedScript?.meta.complexity
        },
        type: 'SCRIPT_EXECUTION_ERROR'
      });
    }
  });  // Batch execute multiple scripts
  fastify.post<{ Body: BatchScriptBody }>('/batch', {
    ...scriptsRouteConfig.batch,
    preHandler: [
      (fastify as any).authenticate,
      async (request: FastifyRequest<{ Body: BatchScriptBody }>, reply: FastifyReply) => {
        // Parse and validate all scripts first
        const scripts = request.body.scripts || [];
        const parsedScripts: (BatchScriptData & { parsed: ParsedScript; index: number })[] = [];
        
        for (const [index, scriptData] of scripts.entries()) {
          try {
            const parsed = scriptParser.parseAndPrepare(scriptData.script);
            
            // Check permissions for each script
            for (const collection of parsed.meta.collections) {
              const operation = getOperationType(parsed.operation);
              if (!(authManager as any).canAccessCollection(request.user, collection, operation)) {
                return reply.code(403).send({
                  error: 'Batch script validation failed',
                  message: `Access denied to collection '${collection}' in script ${index + 1}`,
                  scriptIndex: index
                });
              }
            }
            
            parsedScripts.push({
              ...scriptData,
              parsed,
              index
            });
            
          } catch (error: any) {
            return reply.code(400).send({
              error: 'Batch script parsing failed',
              message: error.message,
              scriptIndex: index
            });
          }
        }
        
        request.parsedScripts = parsedScripts;
      }
    ]
  }, async (request: FastifyRequest<{ Body: BatchScriptBody }>, reply: FastifyReply) => {
    try {
      const startTime = Date.now();
      const { options = {} } = request.body;
      const parsedScripts = request.parsedScripts!;
      const results: ScriptExecutionResult[] = [];
      
      if (options.atomic) {
        // Execute all scripts in a transaction
        await (dbManager as any).withTransaction(async (session: any) => {
          for (const scriptData of parsedScripts) {
            try {
              const result = await executeMongoOperation(scriptData.parsed, { session });
              results.push({
                id: scriptData.id || `script_${scriptData.index}`,
                success: true,
                data: result,
                script: scriptData.script
              });
            } catch (error: any) {
              results.push({
                id: scriptData.id || `script_${scriptData.index}`,
                success: false,
                error: error.message,
                script: scriptData.script
              });
              
              if (options.stopOnError) {
                throw error; // This will rollback the transaction
              }
            }
          }
        });
      } else {
        // Execute scripts independently
        for (const scriptData of parsedScripts) {
          try {
            const result = await executeMongoOperation(scriptData.parsed);
            results.push({
              id: scriptData.id || `script_${scriptData.index}`,
              success: true,
              data: result,
              script: scriptData.script,
              complexity: scriptData.parsed.meta.complexity
            });
          } catch (error: any) {
            results.push({
              id: scriptData.id || `script_${scriptData.index}`,
              success: false,
              error: error.message,
              script: scriptData.script
            });
            
            if (options.stopOnError) {
              break;
            }
          }
        }
      }
      
      const executionTime = Date.now() - startTime;
      const successCount = results.filter(r => r.success).length;
      
      return {
        success: successCount === results.length,
        results,
        meta: {
          totalScripts: parsedScripts.length,
          successCount,
          failureCount: results.length - successCount,
          executionTime: `${executionTime}ms`,
          atomic: options.atomic
        }
      };

    } catch (error: any) {
      fastify.log.error('Batch script execution failed:', error);
      throw error;
    }
  });
  // Validate script without executing
  fastify.post<{ Body: { script: string } }>('/validate', {
    ...scriptsRouteConfig.validate,
    preHandler: [(fastify as any).authenticate]
  }, async (request: FastifyRequest<{ Body: { script: string } }>, reply: FastifyReply) => {
    try {
      const { script } = request.body;
      
      // Parse and validate script
      const parsed = scriptParser.parseAndPrepare(script);
      
      // Check permissions
      const permissionChecks: PermissionCheck[] = [];
      for (const collection of parsed.meta.collections) {
        const operation = getOperationType(parsed.operation);
        const hasAccess = (authManager as any).canAccessCollection(request.user, collection, operation);
        
        permissionChecks.push({
          collection,
          operation,
          hasAccess,
          reason: hasAccess ? null : `Insufficient permissions for ${operation} on ${collection}`
        });
      }
      
      const allPermissionsValid = permissionChecks.every(check => check.hasAccess);
      
      return {
        valid: allPermissionsValid,
        parsed: {
          collection: parsed.collection,
          operation: parsed.operation,
          complexity: parsed.meta.complexity,
          collections: parsed.meta.collections
        },
        permissions: permissionChecks,
        suggestions: generateScriptSuggestions(parsed),
        warnings: generateScriptWarnings(parsed)
      };

    } catch (error: any) {
      return {
        valid: false,
        error: error.message,
        type: 'VALIDATION_ERROR'
      };
    }
  });
  // Get script execution history
  fastify.get<{ Querystring: ScriptHistoryQuery }>('/history', {
    ...scriptsRouteConfig.history,
    preHandler: [(fastify as any).authenticate]
  }, async (request: FastifyRequest<{ Querystring: ScriptHistoryQuery }>, reply: FastifyReply) => {
    try {
      const { limit = 20, page = 1, operation, collection, success } = request.query;
      
      // In production, this would query a script execution log collection
      // For now, return mock data
      const mockHistory: ScriptHistoryItem[] = Array.from({ length: limit }, (_, i) => ({
        id: `script_${Date.now()}_${i}`,
        script: `db.${collection || 'users'}.${operation || 'find'}({})`,
        operation: operation || 'find',
        collection: collection || 'users',
        executedAt: new Date(Date.now() - i * 3600000).toISOString(),
        executedBy: (request.user as any)?.sub || 'unknown',
        success: success !== undefined ? success : Math.random() > 0.1,
        executionTime: Math.floor(Math.random() * 2000) + 100,
        complexity: Math.floor(Math.random() * 5) + 1,
        recordsAffected: Math.floor(Math.random() * 100)
      }));
      
      return {
        success: true,
        history: mockHistory,
        meta: {
          page,
          limit,
          totalCount: 500, // Mock total
          hasNext: page * limit < 500,
          hasPrevious: page > 1,
          filters: { operation, collection, success }
        }
      };

    } catch (error: any) {
      fastify.log.error('Failed to get script history:', error);
      throw error;
    }
  });
}

export default scriptRoutes;
