// Script Execution Routes - Execute raw MongoDB scripts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { 
  scriptsRouteConfig,
  ScriptOptions,
  ScriptBody,
  BatchScriptData,
  BatchScriptBody,
  ScriptExecutionResult,
  PermissionCheck,
  ScriptHistoryQuery,
  ScriptHistoryItem
} from '../config/route/scripts.config';

import { ParsedScript } from '../config/core/script-parser.config';
import SchemaLoader from '../core/schema-loader';
import DbManager from '../core/database-manager';
import AuthManager from '../middleware/auth';
import ScriptParser from '../core/script-parser';

// Extend FastifyRequest and FastifyInstance with custom properties
declare module 'fastify' {
  interface FastifyRequest {
    parsedScripts?: Array<ParsedScript & BatchScriptData & { index: number }>;
    scriptAnalysis?: {
      readOperations: number;
      writeOperations: number;
      aggregationStages: number;
      indexHints: number;
      crossCollectionRefs: boolean;
    };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    schemaLoader: SchemaLoader; 
    dbManager: DbManager; 
    authManager: AuthManager; 
    scriptParser: ScriptParser; 
    authenticate: any;
    parseMongoScript: any;
    validateScript: any;
    scriptRateLimit: any;
    logScriptExecution: any;
    analyzeScript: any;
  }
}

// Script execution routes - Execute raw MongoDB scripts
async function scriptRoutes(fastify: FastifyInstance, options: any): Promise<void> {
  const { schemaLoader, dbManager, authManager, scriptParser } = fastify;

  // Helper methods
  const getOperationType = (operation: string): 'read' | 'create' | 'update' | 'delete' | 'admin' => {
    // Map MongoDB operations to permission types
    const operationMap: { [key: string]: 'read' | 'create' | 'update' | 'delete' | 'admin' } = {
      find: 'read',
      findOne: 'read',
      countDocuments: 'read',
      distinct: 'read',
      aggregate: 'read',
      insertOne: 'create',
      insertMany: 'create',
      updateOne: 'update',
      updateMany: 'update',
      replaceOne: 'update',
      deleteOne: 'delete',
      deleteMany: 'delete',
      bulkWrite: 'update'
    };
    
    return operationMap[operation] || 'read';
  };

  const executeMongoOperation = async (parsed: ParsedScript, options: ScriptOptions = {}): Promise<any> => {
    // Execute MongoDB operation based on parsed script
    const { collection, operation, params } = parsed;
    
    try {
      const db = dbManager.getDb();
      const coll = db.collection(collection);
      
      let result: any;
      
      switch (operation) {
        case 'find':
          result = await coll.find(params.filter || params.query || {}, {
            projection: params.projection,
            sort: params.sort,
            limit: params.limit,
            skip: params.skip,
            session: options.session
          }).toArray();
          break;
          
        case 'findOne':
          result = await coll.findOne(params.filter || params.query || {}, {
            projection: params.projection,
            session: options.session
          });
          break;
          
        case 'insertOne':
          result = await coll.insertOne(params.document, { session: options.session });
          break;
          
        case 'insertMany':
          if (!params.documents || !Array.isArray(params.documents)) {
            throw new Error('insertMany requires a documents array parameter');
          }
          result = await coll.insertMany(params.documents, { session: options.session });
          break;
          
        case 'updateOne':
          result = await coll.updateOne(
            params.filter, 
            params.update, 
            { session: options.session }
          );
          break;
          
        case 'updateMany':
          result = await coll.updateMany(
            params.filter, 
            params.update, 
            { session: options.session }
          );
          break;
          
        case 'replaceOne':
          result = await coll.replaceOne(
            params.filter, 
            params.replacement, 
            { session: options.session }
          );
          break;
          
        case 'deleteOne':
          result = await coll.deleteOne(params.filter, { session: options.session });
          break;
          
        case 'deleteMany':
          result = await coll.deleteMany(params.filter, { session: options.session });
          break;
          
        case 'countDocuments':
          result = await coll.countDocuments(params.filter || {}, { session: options.session });
          break;
          
        case 'distinct':
          result = await coll.distinct(params.field, params.filter || {}, { session: options.session });
          break;
          
        case 'aggregate':
          result = await coll.aggregate(params.pipeline || [], { session: options.session }).toArray();
          break;
          
        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }
      
      return result;
      
    } catch (error: any) {
      fastify.log.error(`MongoDB operation failed: ${operation}`, {
        collection,
        operation,
        error: error.message
      });
      throw error;
    }
  };

  const executeExplain = async (parsed: ParsedScript, startTime: number): Promise<any> => {
    const { collection, operation, params } = parsed;
    
    try {
      const db = await dbManager.getDb();
      const coll = db.collection(collection);
      
      let explainResult: any;
      
      switch (operation) {
        case 'find':
          explainResult = await coll.find(params.filter || {}, {
            projection: params.projection,
            sort: params.sort,
            limit: params.limit,
            skip: params.skip
          }).explain('executionStats');
          break;
          
        case 'aggregate':
          explainResult = await coll.aggregate(params.pipeline || []).explain('executionStats');
          break;
          
        default:
          // For operations that don't support explain, return basic info
          explainResult = {
            operation,
            collection,
            queryPlanner: {
              plannerVersion: 1,
              namespace: `${db.databaseName}.${collection}`,
              indexFilterSet: false,
              parsedQuery: params.filter || {},
              optimizedPipeline: params.pipeline || undefined
            },
            executionStats: {
              totalDocsExamined: 0,
              totalDocsReturned: 0,
              executionTimeMillis: Date.now() - startTime,
              explainVersion: "1"
            }
          };
      }
      
      return {
        success: true,
        explain: explainResult,
        meta: {
          operation,
          collection,
          executionTime: `${Date.now() - startTime}ms`,
          explain: true
        }
      };
      
    } catch (error: any) {
      fastify.log.error(`Explain operation failed: ${operation}`, {
        collection,
        operation,
        error: error.message
      });
      throw error;
    }
  };

  const getRecordsAffected = (result: any, operation: string): number => {
    // Extract records affected based on operation type
    if (result && typeof result === 'object') {
      if (result.modifiedCount !== undefined) return result.modifiedCount;
      if (result.deletedCount !== undefined) return result.deletedCount;
      if (result.insertedCount !== undefined) return result.insertedCount;
      if (result.matchedCount !== undefined) return result.matchedCount;
      if (result.upsertedCount !== undefined) return result.upsertedCount;
    }
    
    if (Array.isArray(result)) return result.length;
    if (typeof result === 'number') return result;
    
    return 0;
  };

  const generateScriptSuggestions = (parsed: ParsedScript): string[] => {
    const suggestions: string[] = [];
    
    if (parsed.operation === 'find' && !parsed.params.limit) {
      suggestions.push('Consider adding a limit to your query for better performance');
    }
    
    if (parsed.operation.includes('update') && !parsed.params.filter) {
      suggestions.push('Be careful with update operations without filters - they will affect all documents');
    }
    
    if (parsed.operation.includes('delete') && !parsed.params.filter) {
      suggestions.push('Delete operations without filters will remove all documents');
    }
    
    if (parsed.operation === 'find' && !parsed.params.projection) {
      suggestions.push('Consider using projection to limit returned fields');
    }
    
    if (parsed.operation === 'aggregate' && parsed.params.pipeline && parsed.params.pipeline.length > 5) {
      suggestions.push('Consider optimizing your aggregation pipeline - it has many stages');
    }
    
    return suggestions;
  };

  const generateScriptWarnings = (parsed: ParsedScript): string[] => {
    const warnings: string[] = [];
    
    if (parsed.meta && parsed.meta.complexity && parsed.meta.complexity > 3) {
      warnings.push('High complexity script detected - may impact performance');
    }
    
    if (parsed.operation.includes('delete') && !parsed.params.filter) {
      warnings.push('DANGER: Delete operation without filter will remove ALL documents');
    }
    
    if (parsed.operation.includes('update') && !parsed.params.filter) {
      warnings.push('WARNING: Update operation without filter will modify ALL documents');
    }
    
    if (parsed.params.limit && parsed.params.limit > 1000) {
      warnings.push('Large limit detected - may cause memory issues');
    }
    
    return warnings;
  };

  // Execute raw MongoDB script
  fastify.post<{ Body: ScriptBody }>('/execute', {
    ...scriptsRouteConfig.execute,
    preHandler: [
      fastify.authenticate,
      fastify.parseMongoScript(),
      fastify.validateScript(),
      fastify.scriptRateLimit(),
      fastify.logScriptExecution(),
      fastify.analyzeScript()
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
            originalScript: parsed.meta?.originalScript,
            complexity: parsed.meta?.complexity
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
          original: parsed.meta?.originalScript,
          parsed: scriptParser.parametersToScript(parsed.collection, parsed.operation, parsed.params),
          complexity: parsed.meta?.complexity,
          collections: parsed.meta?.collections
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
          original: request.parsedScript?.meta?.originalScript,
          complexity: request.parsedScript?.meta?.complexity
        },
        type: 'SCRIPT_EXECUTION_ERROR'
      });
    }
  });

  // Batch execute multiple scripts
  fastify.post<{ Body: BatchScriptBody }>('/batch', {
    ...scriptsRouteConfig.batch,
    preHandler: [
      fastify.authenticate,
      async (request: FastifyRequest<{ Body: BatchScriptBody }>, reply: FastifyReply) => {
        // Parse and validate all scripts first
        const scripts = request.body.scripts || [];
        const parsedScripts: Array<ParsedScript & BatchScriptData & { index: number }> = [];
        
        for (const [index, scriptData] of scripts.entries()) {
          try {
            const parsed = scriptParser.parseAndPrepare(scriptData.script);
            
            // Check permissions for each script
            for (const collection of parsed.meta?.collections || []) {
              const operation = getOperationType(parsed.operation);
              if (!authManager.canAccessCollection(request.user, collection, operation)) {
                return reply.code(403).send({
                  error: 'Batch script validation failed',
                  message: `Access denied to collection '${collection}' in script ${index + 1}`,
                  scriptIndex: index
                });
              }
            }
            
            parsedScripts.push({
              ...parsed,
              ...scriptData,
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
        await dbManager.withTransaction(async (session: any) => {
          for (const scriptData of parsedScripts) {
            try {
              const result = await executeMongoOperation(scriptData, { session });
              results.push({
                id: scriptData.id || `script_${scriptData.index}`,
                success: true,
                data: result,
                script: scriptData.script,
                complexity: scriptData.meta?.complexity
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
            const result = await executeMongoOperation(scriptData);
            results.push({
              id: scriptData.id || `script_${scriptData.index}`,
              success: true,
              data: result,
              script: scriptData.script,
              complexity: scriptData.meta?.complexity
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
    preHandler: [fastify.authenticate]
  }, async (request: FastifyRequest<{ Body: { script: string } }>, reply: FastifyReply) => {
    try {
      const { script } = request.body;
      
      // Parse and validate script
      const parsed = scriptParser.parseAndPrepare(script);
      
      // Check permissions
      const permissionChecks: PermissionCheck[] = [];
      for (const collection of parsed.meta?.collections || []) {
        const operation = getOperationType(parsed.operation);
        const hasAccess = authManager.canAccessCollection(request.user, collection, operation);
        
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
          complexity: parsed.meta?.complexity || 0,
          collections: parsed.meta?.collections || []
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
    preHandler: [fastify.authenticate]
  }, async (request: FastifyRequest<{ Querystring: ScriptHistoryQuery }>, reply: FastifyReply) => {
    try {
      const { limit = 20, page = 1, operation, collection, success } = request.query;
      
      // In production, this would query a script execution log collection
      // For now, return mock data based on JavaScript version
      const mockHistory: ScriptHistoryItem[] = Array.from({ length: limit }, (_, i) => ({
        id: `script_${Date.now()}_${i}`,
        script: `db.${collection || 'users'}.${operation || 'find'}({})`,
        operation: operation || 'find',
        collection: collection || 'users',
        executedAt: new Date(Date.now() - i * 3600000).toISOString(),
        executedBy: request.user?.sub || 'unknown',
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

  // Get script execution statistics
  fastify.get('/stats', {
    schema: {
      description: 'Get script execution statistics',
      tags: ['Scripts'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            stats: {
              type: 'object',
              properties: {
                totalExecutions: { type: 'integer' },
                successRate: { type: 'number' },
                averageExecutionTime: { type: 'number' },
                topOperations: { type: 'array' },
                topCollections: { type: 'array' }
              }
            }
          }
        }
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // In production, this would aggregate from script execution logs
      const mockStats = {
        totalExecutions: 1247,
        successRate: 0.924,
        averageExecutionTime: 245.7,
        topOperations: [
          { operation: 'find', count: 456, percentage: 36.6 },
          { operation: 'updateOne', count: 234, percentage: 18.8 },
          { operation: 'insertOne', count: 189, percentage: 15.2 }
        ],
        topCollections: [
          { collection: 'users', count: 389, percentage: 31.2 },
          { collection: 'products', count: 267, percentage: 21.4 },
          { collection: 'orders', count: 198, percentage: 15.9 }
        ]
      };
      
      return {
        success: true,
        stats: mockStats
      };
      
    } catch (error: any) {
      fastify.log.error('Failed to get script statistics:', error);
      throw error;
    }
  });
}

export default scriptRoutes;