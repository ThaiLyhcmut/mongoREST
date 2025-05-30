// CRUD Routes - Auto-generated based on collection schemas
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  crudRouteConfig,
  CollectionInfo,
  CollectionEndpoints,
  CollectionPermissions,
  CollectionIndex,
  CollectionListResponse,
  CollectionSchemaResponse,
  CollectionStatsResponse,
  BulkOperationsRequest,
  BulkOperationsResponse,
  AggregationRequest,
  AggregationResponse,
  CollectionMeta,
  CollectionStats,
  BulkOperationItem,
  BulkOperationResult
} from '../config/route/crud.config';
import SchemaLoader from '../core/schema-loader';
import DatabaseManager from '../core/database-manager';
import AuthManager from '../middleware/auth';
import ValidationManager from '../middleware/validation';
import CRUDGenerator from '../core/curd-generator';

// Extended Fastify instance with our custom properties
interface ExtendedFastifyInstance extends FastifyInstance {
  schemaLoader: SchemaLoader;
  dbManager: DatabaseManager;
  authManager: AuthManager;
  validationManager: ValidationManager;
  crudGenerator: CRUDGenerator;
  authenticate: any;
  authorizeCollection: any;
  validateMethodOperation: any;
}

async function crudRoutes(fastify: FastifyInstance, options: any): Promise<void> {
  const extendedFastify = fastify as ExtendedFastifyInstance;
  const { schemaLoader, dbManager, authManager, validationManager, crudGenerator } = extendedFastify;

  // Decorators should already be available from parent context via server.js
  // No need to re-decorate here

  // Register CRUD routes for all collections
  await crudGenerator.registerRoutes(fastify);

  // Helper function to execute bulk operations
  const executeBulkOperation = async (operation: BulkOperationItem, session?: any): Promise<any> => {
    const collection = dbManager.collection(operation.collection);
    const options = session ? { session } : {};

    switch (operation.operation) {
      case 'insertOne':
        return await collection.insertOne(operation.data, options);
      case 'insertMany':
        return await collection.insertMany(operation.data, options);
      case 'updateOne':
        return await collection.updateOne(operation.data.filter, operation.data.update, options);
      case 'updateMany':
        return await collection.updateMany(operation.data.filter, operation.data.update, options);
      case 'deleteOne':
        return await collection.deleteOne(operation.data.filter, options);
      case 'deleteMany':
        return await collection.deleteMany(operation.data.filter, options);
      default:
        throw new Error(`Unsupported operation: ${operation.operation}`);
    }
  };

  // Collection info endpoint
  fastify.get<{ Reply: CollectionListResponse }>('/', {
    schema: crudRouteConfig.list
  }, async (request: FastifyRequest, reply: FastifyReply): Promise<CollectionListResponse> => {
    try {
      const collections: CollectionInfo[] = [];
      
      for (const [name, schema] of schemaLoader.schemas) {
        const baseUrl = `/crud/${name}`;
        
        // Build endpoint URLs
        const endpoints: CollectionEndpoints = {
          list: `GET ${baseUrl}`,
          get: `GET ${baseUrl}/:id`,
          create: `POST ${baseUrl}`,
          update: `PATCH ${baseUrl}/:id`,
          replace: `PUT ${baseUrl}/:id`,
          delete: `DELETE ${baseUrl}/:id`
        };

        // Get permissions from schema metadata
        const permissions: CollectionPermissions = (schema as any).mongorest?.permissions || {};
        
        // Get indexes from schema metadata
        const indexes: CollectionIndex[] = (schema.indexes || []).map((index: any) => ({
          name: index.name,
          fields: index.fields || Object.keys(index.key || {}),
          unique: index.unique || false,
          sparse: index.sparse || false
        }));

        collections.push({
          name,
          title: schema.title || name,
          description: schema.description || `${name} collection`,
          collection: (schema as any).collection || name,
          endpoints,
          permissions,
          rateLimits: (schema as any).mongorest?.rateLimits || {},
          indexes,
          searchFields: (schema as any).mongorest?.searchFields || [],
          defaultSort: (schema as any).mongorest?.defaultSort || {},
          limits: {
            default: (schema as any).mongorest?.defaultLimit || 50,
            max: (schema as any).mongorest?.maxLimit || 1000
          },
          properties: 0,
          required: 0
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

    } catch (error: any) {
      fastify.log.error('Failed to list collections:', error);
      throw error;
    }
  });

  // Collection schema endpoint
  fastify.get<{ 
    Params: { collection: string }; 
    Reply: CollectionSchemaResponse;
  }>('/:collection/schema', {
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
  }, async (request: FastifyRequest<{ Params: { collection: string } }>, reply: FastifyReply): Promise<CollectionSchemaResponse> => {
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
          schemaVersion: (schema as any).$schema || 'http://json-schema.org/draft-07/schema#',
          lastModified: new Date().toISOString() // In production, track actual modification time
        }
      };

    } catch (error: any) {
      fastify.log.error('Failed to get collection schema:', error);
      throw error;
    }
  });

  // Collection statistics endpoint
  fastify.get<{ 
    Params: { collection: string }; 
    Reply: CollectionStatsResponse;
  }>('/:collection/stats', {
    schema: crudRouteConfig.stats,
    preHandler: [
      extendedFastify.authenticate,
      extendedFastify.authorizeCollection('read')
    ]
  }, async (request: FastifyRequest<{ Params: { collection: string } }>, reply: FastifyReply): Promise<CollectionStatsResponse> => {
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

      const stats: CollectionStats = {
        totalDocuments,
        estimatedSize: dbManager.formatBytes(estimatedSize),
        avgDocumentSize: dbManager.formatBytes(avgDocumentSize),
        indexes: indexes.length,
        indexDetails: indexes.map((idx: any) => ({
          name: idx.name,
          keys: idx.key,
          unique: idx.unique || false,
          sparse: idx.sparse || false
        })),
      };

      return {
        success: true,
        collection: collectionName,
        stats,
        schema: {
          title: schema.title || collectionName,
          requiredFields: schema.required || [],
          totalProperties: Object.keys(schema.properties || {}).length
        },
        meta: {
          lastUpdated: new Date().toISOString()
        }
      };

    } catch (error: any) {
      fastify.log.error('Failed to get collection stats:', error);
      throw error;
    }
  });

  // Bulk operations endpoint
  fastify.post<{ 
    Body: BulkOperationsRequest; 
    Reply: BulkOperationsResponse;
  }>('/bulk', {
    schema: crudRouteConfig.bulk,
    preHandler: [
      extendedFastify.authenticate,
      extendedFastify.validateMethodOperation()
    ]
  }, async (request: FastifyRequest<{ Body: BulkOperationsRequest }>, reply: FastifyReply): Promise<BulkOperationsResponse> => {
    try {
      const { operations, atomic = false } = request.body;
      const results: BulkOperationResult[] = [];

      // Validate permissions for all operations first
      for (const op of operations) {
        const permissionType = op.operation.includes('insert') ? 'create' : 
                              op.operation.includes('update') ? 'update' : 
                              op.operation.includes('delete') ? 'delete' : 'read';
        
        const canAccess = authManager.canAccessCollection(
          request.user, 
          op.collection, 
          permissionType
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
        await dbManager.withTransaction(async (session: any) => {
          for (const [index, op] of operations.entries()) {
            try {
              const result = await executeBulkOperation(op, session);
              results.push({
                index,
                success: true,
                operation: op.operation,
                collection: op.collection,
                result
              });
            } catch (error: any) {
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
            const result = await executeBulkOperation(op);
            results.push({
              index,
              success: true,
              operation: op.operation,
              collection: op.collection,
              result
            });
          } catch (error: any) {
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

    } catch (error: any) {
      fastify.log.error('Bulk operation failed:', error);
      throw error;
    }
  });

  // Raw aggregation endpoint (for complex queries)
  fastify.post<{ 
    Params: { collection: string }; 
    Body: AggregationRequest; 
    Reply: AggregationResponse;
  }>('/:collection/aggregate', {
    schema: crudRouteConfig.aggregate,
    preHandler: [
      extendedFastify.authenticate,
      extendedFastify.authorizeCollection('read'),
      extendedFastify.validateMethodOperation()
    ]
  }, async (request: FastifyRequest<{ 
    Params: { collection: string }; 
    Body: AggregationRequest;
  }>, reply: FastifyReply): Promise<AggregationResponse> => {
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

    } catch (error: any) {
      fastify.log.error('Aggregation failed:', error);
      throw error;
    }
  });
}

export default crudRoutes;