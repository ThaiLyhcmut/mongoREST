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
  CollectionRelationshipsResponse,
  CollectionIndexesResponse,
  CollectionValidationResponse,
  CollectionMeta,
  CollectionStats,
  RelationshipInfo
} from '../config/route.crud.config';

// Extended Fastify instance with our custom properties
interface ExtendedFastifyInstance extends FastifyInstance {
  schemaLoader: any;
  dbManager: any;
  authManager: any;
  validationManager: any;
  crudGenerator: any;
}

async function crudRoutes(fastify: FastifyInstance, options: any): Promise<void> {
  const extendedFastify = fastify as ExtendedFastifyInstance;
  const { schemaLoader, dbManager, authManager, validationManager, crudGenerator } = extendedFastify;

  // Decorators should already be available from parent context via server.js
  // No need to re-decorate here

  // Register CRUD routes for all collections
  await crudGenerator.registerRoutes(fastify);

  // Collection info endpoint
  fastify.get<{ Reply: CollectionListResponse }>('/', crudRouteConfig.list, async (request: FastifyRequest, reply: FastifyReply): Promise<CollectionListResponse> => {
    try {
      const collections: CollectionInfo[] = [];
      
      for (const [name, schema] of schemaLoader.collections) {
        // Extract schema properties for documentation
        const properties = schema.properties || {};
        const required = schema.required || [];
        
        // Build endpoint URLs
        const endpoints: CollectionEndpoints = {
          list: `/crud/${name}`,
          get: `/crud/${name}/:id`,
          create: `/crud/${name}`,
          update: `/crud/${name}/:id`,
          replace: `/crud/${name}/:id`,
          delete: `/crud/${name}/:id`
        };

        // Get permissions from schema metadata
        const permissions: CollectionPermissions = {
          read: schema.permissions?.read || ['user'],
          create: schema.permissions?.create || ['user'],
          update: schema.permissions?.update || ['user'],
          delete: schema.permissions?.delete || ['admin']
        };

        // Get indexes from schema metadata
        const indexes: CollectionIndex[] = (schema.indexes || []).map((index: any) => ({
          name: index.name,
          fields: index.fields,
          unique: index.unique || false,
          sparse: index.sparse || false
        }));

        collections.push({
          name,
          title: schema.title || name,
          description: schema.description || `${name} collection`,
          endpoints,
          permissions,
          indexes,
          properties: Object.keys(properties).length,
          required: required.length,
          relationships: schema.relationships ? Object.keys(schema.relationships).length : 0
        });
      }

      return {
        success: true,
        collections,
        meta: {
          totalCollections: collections.length,
          availableOperations: ['list', 'get', 'create', 'update', 'replace', 'delete'],
          documentation: '/docs'
        }
      };

    } catch (error: any) {
      fastify.log.error('Failed to list collections:', error);
      throw error;
    }
  });

  // Individual collection schema endpoint
  fastify.get<{ 
    Params: { collection: string }; 
    Reply: CollectionSchemaResponse;
  }>('/:collection/schema', crudRouteConfig.schema, async (request: FastifyRequest<{ Params: { collection: string } }>, reply: FastifyReply): Promise<CollectionSchemaResponse> => {
    try {
      const { collection } = request.params;
      const schema = schemaLoader.getSchema(collection);

      if (!schema) {
        return reply.code(404).send({
          error: 'Collection not found',
          message: `Collection '${collection}' does not exist`
        });
      }

      // Format schema properties for API response
      const properties: { [key: string]: SchemaProperty } = {};
      for (const [key, prop] of Object.entries(schema.properties || {})) {
        const property = prop as any;
        properties[key] = {
          type: property.type,
          description: property.description,
          required: (schema.required || []).includes(key),
          format: property.format,
          enum: property.enum,
          minimum: property.minimum,
          maximum: property.maximum,
          pattern: property.pattern,
          default: property.default
        };
      }

      // Extract validation rules
      const validationRules: ValidationRule[] = [];
      if (schema.additionalProperties === false) {
        validationRules.push({
          type: 'schema',
          rule: 'no_additional_properties',
          message: 'Additional properties are not allowed'
        });
      }

      return {
        success: true,
        collection,
        schema: {
          title: schema.title || collection,
          description: schema.description || `Schema for ${collection} collection`,
          type: schema.type || 'object',
          properties,
          required: schema.required || [],
          additionalProperties: schema.additionalProperties !== false,
          validationRules
        },
        meta: {
          version: schema.version || '1.0.0',
          lastModified: new Date().toISOString(),
          propertyCount: Object.keys(properties).length
        }
      };

    } catch (error: any) {
      fastify.log.error(`Failed to get schema for collection ${request.params.collection}:`, error);
      throw error;
    }
  });

  // Collection statistics endpoint
  fastify.get<{ 
    Params: { collection: string }; 
    Reply: CollectionStatsResponse;
  }>('/:collection/stats', crudRouteConfig.stats, async (request: FastifyRequest<{ Params: { collection: string } }>, reply: FastifyReply): Promise<CollectionStatsResponse> => {
    try {
      const { collection } = request.params;
      const schema = schemaLoader.getSchema(collection);

      if (!schema) {
        return reply.code(404).send({
          error: 'Collection not found',
          message: `Collection '${collection}' does not exist`
        });
      }

      // Get collection statistics from database
      const stats = await dbManager.getCollectionStats(collection);
      
      const collectionStats: CollectionStats = {
        documentCount: stats.count || 0,
        averageDocumentSize: stats.avgObjSize || 0,
        totalSize: stats.size || 0,
        storageSize: stats.storageSize || 0,
        indexes: stats.nindexes || 0,
        indexSize: stats.totalIndexSize || 0
      };

      return {
        success: true,
        collection,
        stats: collectionStats,
        meta: {
          collectedAt: new Date().toISOString(),
          database: dbManager.database.databaseName
        }
      };

    } catch (error: any) {
      fastify.log.error(`Failed to get stats for collection ${request.params.collection}:`, error);
      throw error;
    }
  });

  // Collection relationships endpoint
  fastify.get<{ 
    Params: { collection: string }; 
    Reply: CollectionRelationshipsResponse;
  }>('/:collection/relationships', crudRouteConfig.relationships, async (request: FastifyRequest<{ Params: { collection: string } }>, reply: FastifyReply): Promise<CollectionRelationshipsResponse> => {
    try {
      const { collection } = request.params;
      const schema = schemaLoader.getSchema(collection);

      if (!schema) {
        return reply.code(404).send({
          error: 'Collection not found',
          message: `Collection '${collection}' does not exist`
        });
      }

      const relationships: RelationshipInfo[] = [];
      
      // Extract relationships from schema
      if (schema.relationships) {
        for (const [fieldName, relationship] of Object.entries(schema.relationships)) {
          const rel = relationship as any;
          relationships.push({
            field: fieldName,
            type: rel.type || 'reference',
            targetCollection: rel.collection,
            foreignKey: rel.foreignKey || '_id',
            localKey: rel.localKey || fieldName,
            multiple: rel.multiple || false,
            required: (schema.required || []).includes(fieldName),
            cascade: rel.cascade || false
          });
        }
      }

      // Find reverse relationships (collections that reference this one)
      const reverseRelationships: RelationshipInfo[] = [];
      for (const [otherCollection, otherSchema] of schemaLoader.collections) {
        if (otherCollection === collection) continue;
        
        if (otherSchema.relationships) {
          for (const [fieldName, relationship] of Object.entries(otherSchema.relationships)) {
            const rel = relationship as any;
            if (rel.collection === collection) {
              reverseRelationships.push({
                field: fieldName,
                type: 'reverse',
                targetCollection: otherCollection,
                foreignKey: rel.localKey || fieldName,
                localKey: rel.foreignKey || '_id',
                multiple: rel.multiple || false,
                required: false,
                cascade: false
              });
            }
          }
        }
      }

      return {
        success: true,
        collection,
        relationships: {
          outgoing: relationships,
          incoming: reverseRelationships
        },
        meta: {
          totalRelationships: relationships.length + reverseRelationships.length,
          outgoingCount: relationships.length,
          incomingCount: reverseRelationships.length
        }
      };

    } catch (error: any) {
      fastify.log.error(`Failed to get relationships for collection ${request.params.collection}:`, error);
      throw error;
    }
  });

  // Collection indexes endpoint
  fastify.get<{ 
    Params: { collection: string }; 
    Reply: CollectionIndexesResponse;
  }>('/:collection/indexes', crudRouteConfig.indexes, async (request: FastifyRequest<{ Params: { collection: string } }>, reply: FastifyReply): Promise<CollectionIndexesResponse> => {
    try {
      const { collection } = request.params;
      const schema = schemaLoader.getSchema(collection);

      if (!schema) {
        return reply.code(404).send({
          error: 'Collection not found',
          message: `Collection '${collection}' does not exist`
        });
      }

      // Get actual indexes from database
      const dbIndexes = await dbManager.getCollectionIndexes(collection);
      
      const indexes: CollectionIndex[] = dbIndexes.map((index: any) => ({
        name: index.name,
        fields: Object.keys(index.key),
        unique: index.unique || false,
        sparse: index.sparse || false,
        background: index.background || false,
        partialFilterExpression: index.partialFilterExpression,
        expireAfterSeconds: index.expireAfterSeconds
      }));

      return {
        success: true,
        collection,
        indexes,
        meta: {
          totalIndexes: indexes.length,
          totalIndexSize: await dbManager.getIndexSize(collection),
          collectedAt: new Date().toISOString()
        }
      };

    } catch (error: any) {
      fastify.log.error(`Failed to get indexes for collection ${request.params.collection}:`, error);
      throw error;
    }
  });

  // Collection validation endpoint
  fastify.get<{ 
    Params: { collection: string }; 
    Reply: CollectionValidationResponse;
  }>('/:collection/validate', crudRouteConfig.validation, async (request: FastifyRequest<{ Params: { collection: string } }>, reply: FastifyReply): Promise<CollectionValidationResponse> => {
    try {
      const { collection } = request.params;
      const schema = schemaLoader.getSchema(collection);

      if (!schema) {
        return reply.code(404).send({
          error: 'Collection not found',
          message: `Collection '${collection}' does not exist`
        });
      }

      // Validate schema structure
      const validationResults = await validationManager.validateCollectionSchema(collection, schema);
      
      // Sample documents validation
      const sampleCount = 10;
      const sampleValidation = await validationManager.validateSampleDocuments(collection, sampleCount);

      return {
        success: validationResults.isValid && sampleValidation.isValid,
        collection,
        validation: {
          schemaValid: validationResults.isValid,
          schemaErrors: validationResults.errors || [],
          sampleValidation: {
            documentsChecked: sampleValidation.documentsChecked,
            validDocuments: sampleValidation.validDocuments,
            invalidDocuments: sampleValidation.invalidDocuments,
            errors: sampleValidation.errors || []
          },
          recommendations: [
            ...validationResults.recommendations || [],
            ...sampleValidation.recommendations || []
          ]
        },
        meta: {
          validatedAt: new Date().toISOString(),
          schemaVersion: schema.version || '1.0.0'
        }
      };

    } catch (error: any) {
      fastify.log.error(`Failed to validate collection ${request.params.collection}:`, error);
      throw error;
    }
  });
}

export default crudRoutes;
