// Script Execution Routes - Execute raw MongoDB scripts
async function scriptRoutes(fastify, options) {
  const { schemaLoader, dbManager, authManager, scriptParser } = fastify;

  // Execute raw MongoDB script
  fastify.post('/execute', {
    schema: {
      description: 'Execute raw MongoDB script',
      tags: ['Scripts'],
      body: {
        oneOf: [
          {
            type: 'object',
            properties: {
              script: { 
                type: 'string',
                description: 'MongoDB shell script (e.g., "db.users.find({age: {$gte: 18}})")'
              },
              options: {
                type: 'object',
                properties: {
                  timeout: { type: 'integer', default: 30000 },
                  dryRun: { type: 'boolean', default: false },
                  explain: { type: 'boolean', default: false }
                }
              }
            },
            required: ['script']
          },
          {
            type: 'object',
            properties: {
              mongoScript: { 
                type: 'string',
                description: 'Alternative field name for MongoDB script'
              },
              options: { type: 'object' }
            },
            required: ['mongoScript']
          }
        ]
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {},
            script: {
              type: 'object',
              properties: {
                original: { type: 'string' },
                parsed: { type: 'string' },
                complexity: { type: 'integer' },
                collections: { type: 'array' }
              }
            },
            meta: {
              type: 'object',
              properties: {
                operation: { type: 'string' },
                collection: { type: 'string' },
                executionTime: { type: 'string' },
                dryRun: { type: 'boolean' }
              }
            }
          }
        }
      }
    },
    preHandler: [
      fastify.authenticate,
      fastify.parseMongoScript(),
      fastify.validateScript(),
      fastify.scriptRateLimit(),
      fastify.logScriptExecution(),
      fastify.analyzeScript()
    ]
  }, async (request, reply) => {
    try {
      const startTime = Date.now();
      const { options = {} } = request.body;
      const parsed = request.parsedScript;
      
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
        return await this.executeExplain(parsed, startTime);
      }

      // Execute the parsed script
      const result = await this.executeMongoOperation(parsed, options);
      
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
          recordsAffected: this.getRecordsAffected(result, parsed.operation)
        }
      };

    } catch (error) {
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
  });

  // Batch execute multiple scripts
  fastify.post('/batch', {
    schema: {
      description: 'Execute multiple MongoDB scripts in sequence',
      tags: ['Scripts'],
      body: {
        type: 'object',
        properties: {
          scripts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                script: { type: 'string' },
                options: { type: 'object' }
              },
              required: ['script']
            }
          },
          options: {
            type: 'object',
            properties: {
              atomic: { type: 'boolean', default: false },
              stopOnError: { type: 'boolean', default: true },
              timeout: { type: 'integer', default: 60000 }
            }
          }
        },
        required: ['scripts']
      }
    },
    preHandler: [
      fastify.authenticate,
      async (request, reply) => {
        // Parse and validate all scripts first
        const scripts = request.body.scripts || [];
        const parsedScripts = [];
        
        for (const [index, scriptData] of scripts.entries()) {
          try {
            const parsed = scriptParser.parseAndPrepare(scriptData.script);
            
            // Check permissions for each script
            for (const collection of parsed.meta.collections) {
              const operation = this.getOperationType(parsed.operation);
              if (!authManager.canAccessCollection(request.user, collection, operation)) {
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
            
          } catch (error) {
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
  }, async (request, reply) => {
    try {
      const startTime = Date.now();
      const { options = {} } = request.body;
      const parsedScripts = request.parsedScripts;
      const results = [];
      
      if (options.atomic) {
        // Execute all scripts in a transaction
        await dbManager.withTransaction(async (session) => {
          for (const scriptData of parsedScripts) {
            try {
              const result = await this.executeMongoOperation(scriptData.parsed, { session });
              results.push({
                id: scriptData.id || `script_${scriptData.index}`,
                success: true,
                data: result,
                script: scriptData.script
              });
            } catch (error) {
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
            const result = await this.executeMongoOperation(scriptData.parsed);
            results.push({
              id: scriptData.id || `script_${scriptData.index}`,
              success: true,
              data: result,
              script: scriptData.script,
              complexity: scriptData.parsed.meta.complexity
            });
          } catch (error) {
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

    } catch (error) {
      fastify.log.error('Batch script execution failed:', error);
      throw error;
    }
  });

  // Validate script without executing
  fastify.post('/validate', {
    schema: {
      description: 'Validate MongoDB script syntax and permissions',
      tags: ['Scripts'],
      body: {
        type: 'object',
        properties: {
          script: { type: 'string' }
        },
        required: ['script']
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const { script } = request.body;
      
      // Parse and validate script
      const parsed = scriptParser.parseAndPrepare(script);
      
      // Check permissions
      const permissionChecks = [];
      for (const collection of parsed.meta.collections) {
        const operation = this.getOperationType(parsed.operation);
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
          complexity: parsed.meta.complexity,
          collections: parsed.meta.collections
        },
        permissions: permissionChecks,
        suggestions: this.generateScriptSuggestions(parsed),
        warnings: this.generateScriptWarnings(parsed)
      };

    } catch (error) {
      return {
        valid: false,
        error: error.message,
        type: 'VALIDATION_ERROR'
      };
    }
  });

  // Get script execution history
  fastify.get('/history', {
    schema: {
      description: 'Get script execution history for current user',
      tags: ['Scripts'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          page: { type: 'integer', minimum: 1, default: 1 },
          operation: { type: 'string' },
          collection: { type: 'string' },
          success: { type: 'boolean' }
        }
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const { limit = 20, page = 1, operation, collection, success } = request.query;
      
      // In production, this would query a script execution log collection
      // For now, return mock data
      const mockHistory = Array.from({ length: limit }, (_, i) => ({
        id: `script_${Date.now()}_${i}`,
        script: `db.${collection || 'users'}.${operation || 'find'}({})`,
        operation: operation || 'find',
        collection: collection || 'users',
        executedAt: new Date(Date.now() - i * 3600000).toISOString(),
        executedBy: request.user.sub,
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

    } catch (error) {
      fastify.log.error('Failed to get script history:', error);
      throw error;
    }
  });

  // Helper methods
  this.executeMongoOperation = async (parsed, options = {}) => {
    const collection = dbManager.collection(parsed.collection);
    const { session, timeout = 30000 } = options;
    const execOptions = session ? { session } : {};

    // Add timeout
    if (timeout) {
      execOptions.maxTimeMS = timeout;
    }

    switch (parsed.operation) {
      case 'find':
        let cursor = collection.find(parsed.params.query || {}, execOptions);
        if (parsed.params.projection && Object.keys(parsed.params.projection).length > 0) {
          cursor = cursor.project(parsed.params.projection);
        }
        if (parsed.params.sort) cursor = cursor.sort(parsed.params.sort);
        if (parsed.params.skip) cursor = cursor.skip(parsed.params.skip);
        if (parsed.params.limit) cursor = cursor.limit(parsed.params.limit);
        return await cursor.toArray();

      case 'findOne':
        return await collection.findOne(parsed.params.query || {}, execOptions);

      case 'insertOne':
        return await collection.insertOne(parsed.params.document, execOptions);

      case 'insertMany':
        return await collection.insertMany(parsed.params.documents, execOptions);

      case 'updateOne':
        return await collection.updateOne(
          parsed.params.filter,
          parsed.params.update,
          execOptions
        );

      case 'updateMany':
        return await collection.updateMany(
          parsed.params.filter,
          parsed.params.update,
          execOptions
        );

      case 'replaceOne':
        return await collection.replaceOne(
          parsed.params.filter,
          parsed.params.replacement,
          execOptions
        );

      case 'deleteOne':
        return await collection.deleteOne(parsed.params.filter, execOptions);

      case 'deleteMany':
        return await collection.deleteMany(parsed.params.filter, execOptions);

      case 'aggregate':
        return await collection.aggregate(parsed.params.pipeline, execOptions).toArray();

      case 'countDocuments':
        return await collection.countDocuments(parsed.params.query || {}, execOptions);

      case 'distinct':
        return await collection.distinct(parsed.params.field, parsed.params.query || {}, execOptions);

      default:
        throw new Error(`Unsupported operation: ${parsed.operation}`);
    }
  };

  this.executeExplain = async (parsed, startTime) => {
    const collection = dbManager.collection(parsed.collection);
    let explainResult;

    try {
      switch (parsed.operation) {
        case 'find':
          let cursor = collection.find(parsed.params.query || {});
          if (parsed.params.sort) cursor = cursor.sort(parsed.params.sort);
          if (parsed.params.skip) cursor = cursor.skip(parsed.params.skip);
          if (parsed.params.limit) cursor = cursor.limit(parsed.params.limit);
          explainResult = await cursor.explain('executionStats');
          break;

        case 'aggregate':
          explainResult = await collection.aggregate(parsed.params.pipeline).explain('executionStats');
          break;

        default:
          explainResult = { message: `Explain not supported for operation: ${parsed.operation}` };
      }

      return {
        success: true,
        explain: explainResult,
        script: {
          original: parsed.meta.originalScript,
          complexity: parsed.meta.complexity
        },
        meta: {
          operation: parsed.operation,
          collection: parsed.collection,
          executionTime: `${Date.now() - startTime}ms`,
          explained: true
        }
      };

    } catch (error) {
      throw new Error(`Explain failed: ${error.message}`);
    }
  };

  this.getOperationType = (operation) => {
    const operationMap = {
      find: 'read',
      findOne: 'read',
      countDocuments: 'read',
      distinct: 'read',
      insertOne: 'create',
      insertMany: 'create',
      updateOne: 'update',
      updateMany: 'update',
      replaceOne: 'update',
      deleteOne: 'delete',
      deleteMany: 'delete',
      aggregate: 'read'
    };
    
    return operationMap[operation] || 'read';
  };

  this.getRecordsAffected = (result, operation) => {
    switch (operation) {
      case 'find':
      case 'aggregate':
        return Array.isArray(result) ? result.length : 0;
      case 'findOne':
        return result ? 1 : 0;
      case 'insertOne':
        return result.acknowledged ? 1 : 0;
      case 'insertMany':
        return result.insertedCount || 0;
      case 'updateOne':
      case 'updateMany':
        return result.modifiedCount || 0;
      case 'deleteOne':
      case 'deleteMany':
        return result.deletedCount || 0;
      case 'countDocuments':
        return result;
      default:
        return 0;
    }
  };

  this.generateScriptSuggestions = (parsed) => {
    const suggestions = [];
    
    // Suggest indexes for complex queries
    if (parsed.meta.complexity > 5) {
      suggestions.push('Consider adding indexes for better performance');
    }
    
    // Suggest pagination for large result sets
    if (parsed.operation === 'find' && !parsed.params.limit) {
      suggestions.push('Consider adding limit() for large result sets');
    }
    
    // Suggest using aggregation for complex operations
    if (parsed.operation === 'find' && parsed.params.query && Object.keys(parsed.params.query).length > 3) {
      suggestions.push('Consider using aggregation pipeline for complex queries');
    }
    
    return suggestions;
  };

  this.generateScriptWarnings = (parsed) => {
    const warnings = [];
    
    // Warning for operations without filters
    if (['updateMany', 'deleteMany'].includes(parsed.operation) && 
        (!parsed.params.filter || Object.keys(parsed.params.filter).length === 0)) {
      warnings.push('Operation affects all documents - consider adding filters');
    }
    
    // Warning for high complexity
    if (parsed.meta.complexity > 7) {
      warnings.push('High complexity script may impact performance');
    }
    
    return warnings;
  };
}

module.exports = scriptRoutes;
