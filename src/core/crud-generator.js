import { ObjectId } from 'mongodb';
import RelationshipQueryParser from './relationship-parser.js';
import RelationshipFilterParser from './relationship-filter.js';

class CRUDGenerator {
  constructor(schemaLoader, dbManager) {
    this.schemaLoader = schemaLoader;
    this.dbManager = dbManager;
    this.schemas = schemaLoader.schemas;
    this.relationshipParser = new RelationshipQueryParser(schemaLoader);
    this.filterParser = new RelationshipFilterParser(schemaLoader);
  }

  // Generate all CRUD routes for collections
  async registerRoutes(fastify) {
    console.log('Generating CRUD routes...');
    
    for (const [collectionName, schema] of this.schemas) {
      await this.createCRUDRoutes(fastify, collectionName, schema);
      console.log(`  🔄 Generated CRUD routes for: ${collectionName}`);
    }
    
    console.log(`✅ Generated CRUD routes for ${this.schemas.size} collections`);
  }

  // Create CRUD routes for a specific collection
  async createCRUDRoutes(fastify, collectionName, schema) {
    const basePath = `/${collectionName}`;
    const mongorestConfig = schema.mongorest || {};

    // GET /crud/{collection} - List documents with filtering, sorting, pagination
    fastify.get(basePath, {
      schema: this.getListSchema(collectionName, schema),
      preHandler: [
        fastify.authenticate,
        fastify.authorizeCollection('read')
      ]
    }, async (request, reply) => {
      return this.handleList(request, reply, collectionName, schema);
    });

    // GET /crud/{collection}/:id - Get single document by ID
    fastify.get(`${basePath}/:id`, {
      schema: this.getGetSchema(collectionName, schema),
      preHandler: [
        fastify.authenticate,
        fastify.authorizeCollection('read')
      ]
    }, async (request, reply) => {
      return this.handleGet(request, reply, collectionName, schema);
    });

    // POST /crud/{collection} - Create new document
    fastify.post(basePath, {
      schema: this.getCreateSchema(collectionName, schema),
      preHandler: [
        fastify.authenticate,
        fastify.parseMongoScript(),
        fastify.authorizeCollection('create'),
        fastify.validateMethodOperation()
      ]
    }, async (request, reply) => {
      return this.handleCreate(request, reply, collectionName, schema);
    });

    // PUT /crud/{collection}/:id - Replace entire document
    fastify.put(`${basePath}/:id`, {
      schema: this.getReplaceSchema(collectionName, schema),
      preHandler: [
        fastify.authenticate,
        fastify.parseMongoScript(),
        fastify.authorizeCollection('update'),
        fastify.validateMethodOperation()
      ]
    }, async (request, reply) => {
      return this.handleReplace(request, reply, collectionName, schema);
    });

    // PATCH /crud/{collection}/:id - Partial update document
    fastify.patch(`${basePath}/:id`, {
      schema: this.getUpdateSchema(collectionName, schema),
      preHandler: [
        fastify.authenticate,
        fastify.authorizeCollection('update'),
        fastify.validateMethodOperation()
      ]
    }, async (request, reply) => {
      return this.handleUpdate(request, reply, collectionName, schema);
    });

    // DELETE /crud/{collection}/:id - Delete document by ID
    fastify.delete(`${basePath}/:id`, {
      schema: this.getDeleteSchema(collectionName, schema),
      preHandler: [
        fastify.authenticate,
        fastify.authorizeCollection('delete'),
        fastify.validateMethodOperation()
      ]
    }, async (request, reply) => {
      return this.handleDelete(request, reply, collectionName, schema);
    });
  }

  // Handle LIST operation - GET /crud/{collection}
  async handleList(request, reply, collectionName, schema) {
    try {
      const startTime = Date.now();
      const mongorestConfig = schema.mongorest || {};
      const { select, sort, order, page, limit, ...filterParams } = request.query;
      
      // Parse relationship query if select parameter exists
      let selectQuery = null;
      if (select) {
        selectQuery = this.relationshipParser.parseSelectQuery(collectionName, select);
        
        // Validate relationship query
        const errors = this.relationshipParser.validateRelationshipQuery(collectionName, selectQuery.fields);
        if (errors.length > 0) {
          return reply.code(400).send({
            error: 'Invalid relationship query',
            message: 'Relationship validation failed',
            details: errors
          });
        }
      }
      
      // Parse filters including relationship filters
      const { filters, relationshipFilters, specialFilters } = this.filterParser.parseFilters(collectionName, filterParams);
      
      // Validate filters
      const filterErrors = this.filterParser.validateFilters(collectionName, filterParams);
      if (filterErrors.length > 0) {
        return reply.code(400).send({
          error: 'Invalid filters',
          message: 'Filter validation failed',
          details: filterErrors
        });
      }

      let result;
      let pipeline = [];
      let usedAggregation = false;
      
      // Use aggregation if we have relationships or relationship filters
      if (selectQuery?.hasRelationships || Object.keys(relationshipFilters).length > 0) {
        usedAggregation = true;
        
        // Build filtered pipeline
        pipeline = this.filterParser.buildFilteredPipeline(
          collectionName, 
          selectQuery?.fields || [], 
          filters, 
          relationshipFilters, 
          specialFilters
        );
        
        // Add sorting
        const sortStage = this.filterParser.buildSortStage(sort, order, schema);
        if (sortStage) {
          pipeline.push(sortStage);
        }
        
        // Add pagination
        const paginationStages = this.filterParser.buildPaginationStages(
          parseInt(page), 
          parseInt(limit), 
          schema
        );
        pipeline.push(...paginationStages);
        
        // Execute aggregation
        const collection = this.dbManager.collection(collectionName);
        const documents = await collection.aggregate(pipeline).toArray();
        
        // Get total count for pagination (separate query)
        const countPipeline = pipeline.slice(0, -2); // Remove limit and skip
        countPipeline.push({ $count: 'total' });
        const countResult = await collection.aggregate(countPipeline).toArray();
        const totalCount = countResult[0]?.total || 0;
        
        const actualLimit = Math.min(parseInt(limit) || mongorestConfig.defaultLimit || 50, mongorestConfig.maxLimit || 1000);
        const actualPage = Math.max(parseInt(page) || 1, 1);
        
        result = {
          documents,
          pagination: {
            page: actualPage,
            limit: actualLimit,
            totalCount,
            totalPages: Math.ceil(totalCount / actualLimit),
            hasNext: actualPage * actualLimit < totalCount,
            hasPrevious: actualPage > 1
          }
        };
      } else {
        // Use simple find query
        const options = {
          sort: {},
          limit: 50,
          skip: 0
        };
        
        // Apply sorting
        if (sort) {
          const direction = ['desc', '-1'].includes(order) ? -1 : 1;
          options.sort[sort] = direction;
        } else if (mongorestConfig.defaultSort) {
          options.sort = mongorestConfig.defaultSort;
        }
        
        // Apply limits
        const maxLimit = mongorestConfig.maxLimit || 1000;
        const defaultLimit = mongorestConfig.defaultLimit || 50;
        options.limit = Math.min(parseInt(limit) || defaultLimit, maxLimit);
        
        // Apply pagination
        const actualPage = Math.max(parseInt(page) || 1, 1);
        options.skip = (actualPage - 1) * options.limit;
        
        // Execute query with pagination
        result = await this.dbManager.findWithPagination(collectionName, filters, options);
      }
      
      const executionTime = Date.now() - startTime;
      
      return {
        success: true,
        data: result.documents,
        meta: {
          collection: collectionName,
          operation: usedAggregation ? 'aggregate' : 'find',
          ...result.pagination,
          query: Object.keys(filters).length > 0 ? filters : undefined,
          relationshipFilters: Object.keys(relationshipFilters).length > 0 ? relationshipFilters : undefined,
          select: select || undefined,
          pipeline: usedAggregation && process.env.NODE_ENV === 'development' ? pipeline : undefined,
          executionTime: `${executionTime}ms`
        }
      };
    } catch (error) {
      request.log.error('List operation failed:', error);
      throw error;
    }
  }

  // Handle GET operation - GET /crud/{collection}/:id
  async handleGet(request, reply, collectionName, schema) {
    try {
      const startTime = Date.now();
      const { id } = request.params;
      
      // Validate ObjectId
      if (!this.dbManager.isValidObjectId(id)) {
        return reply.code(400).send({
          error: 'Invalid ID format',
          message: 'ID must be a valid MongoDB ObjectId'
        });
      }

      const collection = this.dbManager.collection(collectionName);
      const document = await collection.findOne({ _id: new ObjectId(id) });
      
      if (!document) {
        return reply.code(404).send({
          error: 'Document not found',
          message: `No document found with ID: ${id}`
        });
      }

      const executionTime = Date.now() - startTime;
      
      return {
        success: true,
        data: document,
        meta: {
          collection: collectionName,
          operation: 'findOne',
          id,
          executionTime: `${executionTime}ms`
        }
      };
    } catch (error) {
      request.log.error('Get operation failed:', error);
      throw error;
    }
  }

  // Handle CREATE operation - POST /crud/{collection}
  async handleCreate(request, reply, collectionName, schema) {
    try {
      const startTime = Date.now();
      const document = request.body;
      
      // Validate document against schema
      const validation = this.schemaLoader.validateDocument(collectionName, document);
      if (!validation.valid) {
        return reply.code(400).send({
          error: 'Validation failed',
          message: 'Document does not match schema',
          details: validation.errors
        });
      }

      // Add timestamps
      const now = new Date().toISOString();
      document.createdAt = now;
      document.updatedAt = now;

      // Execute hooks before create
      await this.executeHooks('beforeCreate', collectionName, schema, { document, user: request.user });

      const collection = this.dbManager.collection(collectionName);
      const result = await collection.insertOne(document);
      
      // Execute hooks after create
      await this.executeHooks('afterCreate', collectionName, schema, { 
        document: { ...document, _id: result.insertedId }, 
        user: request.user 
      });

      const executionTime = Date.now() - startTime;
      
      return {
        success: true,
        data: {
          _id: result.insertedId,
          ...document
        },
        meta: {
          collection: collectionName,
          operation: 'insertOne',
          acknowledged: result.acknowledged,
          executionTime: `${executionTime}ms`
        }
      };
    } catch (error) {
      request.log.error('Create operation failed:', error);
      throw error;
    }
  }

  // Handle REPLACE operation - PUT /crud/{collection}/:id
  async handleReplace(request, reply, collectionName, schema) {
    try {
      const startTime = Date.now();
      const { id } = request.params;
      const document = request.body;
      
      // Validate ObjectId
      if (!this.dbManager.isValidObjectId(id)) {
        return reply.code(400).send({
          error: 'Invalid ID format',
          message: 'ID must be a valid MongoDB ObjectId'
        });
      }

      // Validate document against schema
      const validation = this.schemaLoader.validateDocument(collectionName, document);
      if (!validation.valid) {
        return reply.code(400).send({
          error: 'Validation failed',
          message: 'Document does not match schema',
          details: validation.errors
        });
      }

      // Preserve _id and add updated timestamp
      document._id = new ObjectId(id);
      document.updatedAt = new Date().toISOString();

      // Execute hooks before update
      await this.executeHooks('beforeUpdate', collectionName, schema, { document, user: request.user });

      const collection = this.dbManager.collection(collectionName);
      const result = await collection.replaceOne({ _id: new ObjectId(id) }, document);
      
      if (result.matchedCount === 0) {
        return reply.code(404).send({
          error: 'Document not found',
          message: `No document found with ID: ${id}`
        });
      }

      // Execute hooks after update
      await this.executeHooks('afterUpdate', collectionName, schema, { document, user: request.user });

      const executionTime = Date.now() - startTime;
      
      return {
        success: true,
        data: document,
        meta: {
          collection: collectionName,
          operation: 'replaceOne',
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
          executionTime: `${executionTime}ms`
        }
      };
    } catch (error) {
      request.log.error('Replace operation failed:', error);
      throw error;
    }
  }

  // Handle UPDATE operation - PATCH /crud/{collection}/:id
  async handleUpdate(request, reply, collectionName, schema) {
    try {
      const startTime = Date.now();
      const { id } = request.params;
      const updates = request.body;
      
      // Validate ObjectId
      if (!this.dbManager.isValidObjectId(id)) {
        return reply.code(400).send({
          error: 'Invalid ID format',
          message: 'ID must be a valid MongoDB ObjectId'
        });
      }

      // Build update operation
      const updateDoc = {
        $set: {
          ...updates,
          updatedAt: new Date().toISOString()
        }
      };

      // Execute hooks before update
      await this.executeHooks('beforeUpdate', collectionName, schema, { 
        filter: { _id: new ObjectId(id) },
        update: updateDoc,
        user: request.user 
      });

      const collection = this.dbManager.collection(collectionName);
      const result = await collection.updateOne({ _id: new ObjectId(id) }, updateDoc);
      
      if (result.matchedCount === 0) {
        return reply.code(404).send({
          error: 'Document not found',
          message: `No document found with ID: ${id}`
        });
      }

      // Get updated document
      const updatedDocument = await collection.findOne({ _id: new ObjectId(id) });

      // Execute hooks after update
      await this.executeHooks('afterUpdate', collectionName, schema, { 
        document: updatedDocument, 
        user: request.user 
      });

      const executionTime = Date.now() - startTime;
      
      return {
        success: true,
        data: updatedDocument,
        meta: {
          collection: collectionName,
          operation: 'updateOne',
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
          executionTime: `${executionTime}ms`
        }
      };
    } catch (error) {
      request.log.error('Update operation failed:', error);
      throw error;
    }
  }

  // Handle DELETE operation - DELETE /crud/{collection}/:id
  async handleDelete(request, reply, collectionName, schema) {
    try {
      const startTime = Date.now();
      const { id } = request.params;
      
      // Validate ObjectId
      if (!this.dbManager.isValidObjectId(id)) {
        return reply.code(400).send({
          error: 'Invalid ID format',
          message: 'ID must be a valid MongoDB ObjectId'
        });
      }

      // Get document before deletion (for hooks)
      const collection = this.dbManager.collection(collectionName);
      const document = await collection.findOne({ _id: new ObjectId(id) });
      
      if (!document) {
        return reply.code(404).send({
          error: 'Document not found',
          message: `No document found with ID: ${id}`
        });
      }

      // Execute hooks before delete
      await this.executeHooks('beforeDelete', collectionName, schema, { document, user: request.user });

      const result = await collection.deleteOne({ _id: new ObjectId(id) });

      // Execute hooks after delete
      await this.executeHooks('afterDelete', collectionName, schema, { document, user: request.user });

      const executionTime = Date.now() - startTime;
      
      return {
        success: true,
        data: {
          _id: id,
          deleted: true
        },
        meta: {
          collection: collectionName,
          operation: 'deleteOne',
          deletedCount: result.deletedCount,
          executionTime: `${executionTime}ms`
        }
      };
    } catch (error) {
      request.log.error('Delete operation failed:', error);
      throw error;
    }
  }

  // Execute hooks defined in schema
  async executeHooks(hookType, collectionName, schema, context) {
    const mongorestConfig = schema.mongorest || {};
    const hooks = mongorestConfig.hooks || {};
    
    if (!hooks[hookType]) {
      return;
    }

    const hookFunctions = Array.isArray(hooks[hookType]) ? hooks[hookType] : [hooks[hookType]];
    
    for (const hookName of hookFunctions) {
      try {
        await this.executeHook(hookName, context);
      } catch (error) {
        console.error(`Hook '${hookName}' failed for ${hookType} on ${collectionName}:`, error);
        // Don't throw error, just log it
      }
    }
  }

  // Execute individual hook
  async executeHook(hookName, context) {
    // This is where you would implement actual hook execution
    // For now, we'll just log the hook execution
    console.log(`🪝 Executing hook: ${hookName}`, {
      document: context.document?._id,
      user: context.user?.sub
    });

    // Example hook implementations:
    switch (hookName) {
      case 'setTimestamps':
        if (context.document) {
          const now = new Date().toISOString();
          if (!context.document.createdAt) {
            context.document.createdAt = now;
          }
          context.document.updatedAt = now;
        }
        break;
        
      case 'validateEmail':
        if (context.document?.email) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(context.document.email)) {
            throw new Error('Invalid email format');
          }
        }
        break;
        
      // Add more hook implementations as needed
    }
  }

  // Generate Fastify schema for LIST endpoint
  getListSchema(collectionName, schema) {
    return {
      description: `List ${collectionName} documents with filtering, sorting, and pagination`,
      tags: [collectionName],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 1000, default: 50 },
          sort: { type: 'string', description: 'Field to sort by' },
          order: { type: 'string', enum: ['asc', 'desc', '1', '-1'], default: 'asc' },
          select: { 
            type: 'string', 
            description: 'PostgREST-style field selection with relationships (e.g., "id,title,author(*),category(name,slug)")' 
          },
          search: { type: 'string', description: 'Text search query' },
          searchFields: { type: 'string', description: 'Comma-separated list of fields to search in' }
        },
        additionalProperties: true
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: schema },
            meta: {
              type: 'object',
              properties: {
                collection: { type: 'string' },
                operation: { type: 'string' },
                page: { type: 'integer' },
                limit: { type: 'integer' },
                totalCount: { type: 'integer' },
                totalPages: { type: 'integer' },
                hasNext: { type: 'boolean' },
                hasPrevious: { type: 'boolean' },
                executionTime: { type: 'string' }
              }
            }
          }
        }
      }
    };
  }

  // Generate Fastify schema for GET endpoint
  getGetSchema(collectionName, schema) {
    return {
      description: `Get a single ${collectionName} document by ID`,
      tags: [collectionName],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        },
        required: ['id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: schema,
            meta: {
              type: 'object',
              properties: {
                collection: { type: 'string' },
                operation: { type: 'string' },
                id: { type: 'string' },
                executionTime: { type: 'string' }
              }
            }
          }
        }
      }
    };
  }

  // Generate Fastify schema for CREATE endpoint
  getCreateSchema(collectionName, schema) {
    const bodySchema = { ...schema };
    delete bodySchema.properties._id; // ID should not be provided in create

    return {
      description: `Create a new ${collectionName} document`,
      tags: [collectionName],
      body: bodySchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: schema,
            meta: {
              type: 'object',
              properties: {
                collection: { type: 'string' },
                operation: { type: 'string' },
                acknowledged: { type: 'boolean' },
                executionTime: { type: 'string' }
              }
            }
          }
        }
      }
    };
  }

  // Generate Fastify schema for REPLACE endpoint
  getReplaceSchema(collectionName, schema) {
    const bodySchema = { ...schema };
    delete bodySchema.properties._id; // ID comes from URL parameter

    return {
      description: `Replace an entire ${collectionName} document`,
      tags: [collectionName],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        },
        required: ['id']
      },
      body: bodySchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: schema,
            meta: {
              type: 'object',
              properties: {
                collection: { type: 'string' },
                operation: { type: 'string' },
                matchedCount: { type: 'integer' },
                modifiedCount: { type: 'integer' },
                executionTime: { type: 'string' }
              }
            }
          }
        }
      }
    };
  }

  // Generate Fastify schema for UPDATE endpoint
  getUpdateSchema(collectionName, schema) {
    return {
      description: `Partially update a ${collectionName} document`,
      tags: [collectionName],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        description: 'Fields to update'
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: schema,
            meta: {
              type: 'object',
              properties: {
                collection: { type: 'string' },
                operation: { type: 'string' },
                matchedCount: { type: 'integer' },
                modifiedCount: { type: 'integer' },
                executionTime: { type: 'string' }
              }
            }
          }
        }
      }
    };
  }

  // Generate Fastify schema for DELETE endpoint
  getDeleteSchema(collectionName, schema) {
    return {
      description: `Delete a ${collectionName} document by ID`,
      tags: [collectionName],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        },
        required: ['id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                _id: { type: 'string' },
                deleted: { type: 'boolean' }
              }
            },
            meta: {
              type: 'object',
              properties: {
                collection: { type: 'string' },
                operation: { type: 'string' },
                deletedCount: { type: 'integer' },
                executionTime: { type: 'string' }
              }
            }
          }
        }
      }
    };
  }
}

export default CRUDGenerator;
