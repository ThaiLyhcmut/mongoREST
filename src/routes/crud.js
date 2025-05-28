// CRUD Routes - Auto-generated based on collection schemas
async function crudRoutes(fastify, options) {
  const { schemaLoader, dbManager, authManager, validationManager, crudGenerator } = fastify;

  // Decorators should already be available from parent context via server.js
  // No need to re-decorate here

  // Register CRUD routes for all collections
  await crudGenerator.registerRoutes(fastify);

  // Collection info endpoint
  fastify.get('/', {
    schema: {
      description: 'List all available collections and their schemas',
      tags: ['Collections'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            collections: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  endpoints: {
                    type: 'object',
                    properties: {
                      list: { type: 'string' },
                      get: { type: 'string' },
                      create: { type: 'string' },
                      update: { type: 'string' },
                      replace: { type: 'string' },
                      delete: { type: 'string' }
                    }
                  },
                  permissions: { type: 'object' },
                  indexes: { type: 'array' }
                }
              }
            },
            meta: {
              type: 'object',
              properties: {
                totalCollections: { type: 'integer' },
                availableOperations: { type: 'array' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const collections = [];
      
      for (const [name, schema] of schemaLoader.schemas) {
        const baseUrl = `/crud/${name}`;
        
        collections.push({
          name,
          title: schema.title,
          description: schema.description,
          collection: schema.collection || name,
          endpoints: {
            list: `GET ${baseUrl}`,
            get: `GET ${baseUrl}/:id`,
            create: `POST ${baseUrl}`,
            update: `PATCH ${baseUrl}/:id`,
            replace: `PUT ${baseUrl}/:id`,
            delete: `DELETE ${baseUrl}/:id`
          },
          permissions: schema.mongorest?.permissions || {},
          rateLimits: schema.mongorest?.rateLimits || {},
          indexes: schema.indexes || [],
          searchFields: schema.mongorest?.searchFields || [],
          defaultSort: schema.mongorest?.defaultSort || {},
          limits: {
            default: schema.mongorest?.defaultLimit || 50,
            max: schema.mongorest?.maxLimit || 1000
          }
        });
      }

      return {
        success: true,
        collections,
        meta: {
          totalCollections: collections.length,
          availableOperations: ['find', 'findOne', 'insertOne', 'updateOne', 'replaceOne', 'deleteOne'],
          documentation: '/docs'
        }
      };
    } catch (error) {
      fastify.log.error('Failed to list collections:', error);
      throw error;
    }
  });

  // Collection schema endpoint
  fastify.get('/:collection/schema', {
    schema: {
      description: 'Get JSON schema for a specific collection',
      tags: ['Collections'],
      params: {
        type: 'object',
        properties: {
          collection: { type: 'string' }
        },
        required: ['collection']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            collection: { type: 'string' },
            schema: { type: 'object' },
            meta: {
              type: 'object',
              properties: {
                schemaVersion: { type: 'string' },
                lastModified: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { collection } = request.params;
      const schema = schemaLoader.getSchema(collection);
      
      if (!schema) {
        return reply.code(404).send({
          error: 'Collection not found',
          message: `Collection '${collection}' does not exist`
        });
      }

      return {
        success: true,
        collection,
        schema,
        meta: {
          schemaVersion: schema.$schema || 'http://json-schema.org/draft-07/schema#',
          lastModified: new Date().toISOString() // In production, track actual modification time
        }
      };
    } catch (error) {
      fastify.log.error('Failed to get collection schema:', error);
      throw error;
    }
  });

  // Collection statistics endpoint
  fastify.get('/:collection/stats', {
    schema: {
      description: 'Get statistics for a specific collection',
      tags: ['Collections'],
      params: {
        type: 'object',
        properties: {
          collection: { type: 'string' }
        },
        required: ['collection']
      }
    },
    preHandler: [
      fastify.authenticate,
      fastify.authorizeCollection('read')
    ]
  }, async (request, reply) => {
    try {
      const { collection: collectionName } = request.params;
      const schema = schemaLoader.getSchema(collectionName);
      
      if (!schema) {
        return reply.code(404).send({
          error: 'Collection not found',
          message: `Collection '${collectionName}' does not exist`
        });
      }

      const collection = dbManager.collection(collectionName);
      
      // Get collection statistics
      const [totalDocuments, indexes, sampleDocuments] = await Promise.all([
        collection.countDocuments(),
        collection.indexes(),
        collection.find().limit(1).toArray()
      ]);

      // Calculate estimated document size
      let avgDocumentSize = 0;
      if (sampleDocuments.length > 0) {
        const sampleSize = JSON.stringify(sampleDocuments[0]).length;
        avgDocumentSize = sampleSize;
      }

      const estimatedSize = totalDocuments * avgDocumentSize;

      return {
        success: true,
        collection: collectionName,
        stats: {
          totalDocuments,
          estimatedSize: dbManager.formatBytes(estimatedSize),
          avgDocumentSize: dbManager.formatBytes(avgDocumentSize),
          indexes: indexes.length,
          indexDetails: indexes.map(idx => ({
            name: idx.name,
            keys: idx.key,
            unique: idx.unique || false,
            sparse: idx.sparse || false
          }))
        },
        schema: {
          title: schema.title,
          requiredFields: schema.required || [],
          totalProperties: Object.keys(schema.properties || {}).length
        },
        meta: {
          lastUpdated: new Date().toISOString()
        }
      };
    } catch (error) {
      fastify.log.error('Failed to get collection stats:', error);
      throw error;
    }
  });

  // Bulk operations endpoint
  fastify.post('/bulk', {
    schema: {
      description: 'Execute bulk operations across multiple collections',
      tags: ['Bulk Operations'],
      body: {
        type: 'object',
        properties: {
          operations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                collection: { type: 'string' },
                operation: { 
                  type: 'string',
                  enum: ['insertOne', 'insertMany', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany']
                },
                data: { type: 'object' }
              },
              required: ['collection', 'operation']
            }
          },
          atomic: { type: 'boolean', default: false }
        },
        required: ['operations']
      }
    },
    preHandler: [
      fastify.authenticate,
      fastify.validateMethodOperation()
    ]
  }, async (request, reply) => {
    try {
      const { operations, atomic = false } = request.body;
      const results = [];

      // Validate permissions for all operations first
      for (const op of operations) {
        const canAccess = authManager.canAccessCollection(
          request.user, 
          op.collection, 
          op.operation.includes('insert') ? 'create' : 
          op.operation.includes('update') ? 'update' : 
          op.operation.includes('delete') ? 'delete' : 'read'
        );
        
        if (!canAccess) {
          return reply.code(403).send({
            error: 'Bulk operation denied',
            message: `Insufficient permissions for ${op.operation} on ${op.collection}`
          });
        }
      }

      if (atomic) {
        // Execute all operations in a transaction
        await dbManager.withTransaction(async (session) => {
          for (const [index, op] of operations.entries()) {
            try {
              const result = await this.executeBulkOperation(op, session);
              results.push({
                index,
                success: true,
                operation: op.operation,
                collection: op.collection,
                result
              });
            } catch (error) {
              results.push({
                index,
                success: false,
                operation: op.operation,
                collection: op.collection,
                error: error.message
              });
              throw error; // This will rollback the transaction
            }
          }
        });
      } else {
        // Execute operations independently
        for (const [index, op] of operations.entries()) {
          try {
            const result = await this.executeBulkOperation(op);
            results.push({
              index,
              success: true,
              operation: op.operation,
              collection: op.collection,
              result
            });
          } catch (error) {
            results.push({
              index,
              success: false,
              operation: op.operation,
              collection: op.collection,
              error: error.message
            });
          }
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      return {
        success: failureCount === 0,
        results,
        meta: {
          totalOperations: operations.length,
          successCount,
          failureCount,
          atomic
        }
      };
    } catch (error) {
      fastify.log.error('Bulk operation failed:', error);
      throw error;
    }
  });

  // Helper method for bulk operations
  this.executeBulkOperation = async (operation, session = null) => {
    const collection = dbManager.collection(operation.collection);
    const options = session ? { session } : {};

    switch (operation.operation) {
      case 'insertOne':
        return await collection.insertOne(operation.data, options);
      case 'insertMany':
        return await collection.insertMany(operation.data, options);
      case 'updateOne':
        return await collection.updateOne(operation.filter, operation.update, options);
      case 'updateMany':
        return await collection.updateMany(operation.filter, operation.update, options);
      case 'deleteOne':
        return await collection.deleteOne(operation.filter, options);
      case 'deleteMany':
        return await collection.deleteMany(operation.filter, options);
      default:
        throw new Error(`Unsupported bulk operation: ${operation.operation}`);
    }
  };

  // Raw aggregation endpoint (for complex queries)
  fastify.post('/:collection/aggregate', {
    schema: {
      description: 'Execute aggregation pipeline on collection',
      tags: ['Aggregation'],
      params: {
        type: 'object',
        properties: {
          collection: { type: 'string' }
        },
        required: ['collection']
      },
      body: {
        type: 'object',
        properties: {
          pipeline: { type: 'array' },
          options: { type: 'object' }
        },
        required: ['pipeline']
      }
    },
    preHandler: [
      fastify.authenticate,
      fastify.authorizeCollection('read'),
      fastify.validateMethodOperation()
    ]
  }, async (request, reply) => {
    try {
      const { collection: collectionName } = request.params;
      const { pipeline, options = {} } = request.body;

      const schema = schemaLoader.getSchema(collectionName);
      if (!schema) {
        return reply.code(404).send({
          error: 'Collection not found',
          message: `Collection '${collectionName}' does not exist`
        });
      }

      // Validate aggregation pipeline for write operations
      const pipelineValidation = validationManager.validateAggregationPipeline(pipeline);
      if (request.method === 'GET' && pipelineValidation.hasWriteStages) {
        return reply.code(400).send({
          error: 'Invalid aggregation for GET request',
          message: 'GET requests cannot use aggregation pipelines with write stages ($out, $merge)'
        });
      }

      const startTime = Date.now();
      const result = await dbManager.aggregate(collectionName, pipeline, options);
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        data: result,
        meta: {
          collection: collectionName,
          operation: 'aggregate',
          pipelineStages: pipeline.length,
          hasWriteStages: pipelineValidation.hasWriteStages,
          executionTime: `${executionTime}ms`
        }
      };
    } catch (error) {
      fastify.log.error('Aggregation failed:', error);
      throw error;
    }
  });
}

module.exports = crudRoutes;
