// Relationship Middleware - Parse and validate relationship queries
import { FastifyRequest, FastifyReply } from 'fastify';
import RelationshipQueryParser from '../core/relationship-parser';
import RelationshipFilterParser from '../core/relationship-filter';
import crypto from 'crypto';

import {
  ParsedSelectQuery,
  RelationshipContext,
  RelationshipQuery,
  RelationshipValidationError,
  ParsedFilters,
  SelectField
} from '../config/middleware/relationships.config';

import { UserContext } from '../config/middleware/auth.config';

import SchemaLoader from '../core/schema-loader';

// Extend FastifyRequest to include relationship properties
declare module 'fastify' {
  interface FastifyRequest {
    relationshipQuery?: ParsedSelectQuery;
    parsedFilters?: {
      filters: { [field: string]: any };
      relationshipFilters: { [field: string]: any };
      specialFilters: { [field: string]: any };
    };
    cacheKey?: string;
    relationshipQueryLog?: any;
    user: UserContext; 
  }
}

// Cache client interface
interface CacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
}

/**
 * Relationship middleware for parsing and validating relationship queries
 */
class RelationshipMiddleware {
  private schemaLoader: SchemaLoader;
  private relationshipParser: RelationshipQueryParser;
  private filterParser: RelationshipFilterParser;

  constructor(schemaLoader: SchemaLoader) {
    this.schemaLoader = schemaLoader;
    this.relationshipParser = new RelationshipQueryParser(schemaLoader);
    this.filterParser = new RelationshipFilterParser(schemaLoader as any);
  }

  /**
   * Create middleware function for relationship parsing
   * @returns Fastify middleware function
   */
  parseRelationships() {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        const collectionName = (request.params as any)?.collection || 
                               request.routerPath?.split('/').pop();
        
        if (!collectionName) {
          return reply.code(400).send({
            error: 'Collection not specified',
            message: 'Unable to determine collection from request'
          });
        }

        // Parse relationship query if select parameter exists
        const query = request.query as any;
        if (query.select) {
          const selectQuery: ParsedSelectQuery = this.relationshipParser.parseSelectQuery(
            collectionName, 
            query.select
          );
          
          // Validate relationship query
          const errors = (this.relationshipParser as any).validateRelationshipQuery(
            collectionName, 
            selectQuery.fields
          );
          
          if (errors.length > 0) {
            return reply.code(400).send({
              error: 'Invalid relationship query',
              message: 'Relationship validation failed',
              details: errors
            });
          }
          
          // Store parsed query in request context
          request.relationshipQuery = selectQuery;
        }

        // Parse filters including relationship filters
        const parseResult = this.filterParser.parseFilters(collectionName, query);
        const { filters, relationshipFilters, specialFilters } = parseResult as any;
        
        // Validate filters
        const filterErrors = (this.filterParser as any).validateFilters(
          collectionName, 
          query
        );
        
        if (filterErrors.length > 0) {
          return reply.code(400).send({
            error: 'Invalid filters',
            message: 'Filter validation failed',
            details: filterErrors
          });
        }
        
        // Store parsed filters in request context
        request.parsedFilters = {
          filters,
          relationshipFilters,
          specialFilters
        };
        
      } catch (error: any) {
        request.log.error('Relationship parsing failed:', error);
        return reply.code(500).send({
          error: 'Relationship parsing failed',
          message: error.message
        });
      }
    };
  }

  /**
   * Create middleware function for validating relationship permissions
   * @returns Fastify middleware function
   */
  validateRelationshipPermissions() {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        const collectionName = (request.params as any)?.collection || 
                               request.routerPath?.split('/').pop();
        
        if (!request.relationshipQuery) {
          return; // No relationships to validate
        }

        const userRole = request.user?.role;
        const schema = this.schemaLoader.getSchema(collectionName);
        
        // Check permissions for each relationship
        for (const field of request.relationshipQuery.fields) {
          if (field.type === 'relationship' || field.type === 'aggregate') {
            const relationName = field.relationName || field.alias;
            const relationship = (schema as any)?.relationships?.[relationName || ''];
            
            if (relationship) {
              // Check if user has permission to access this relationship
              const hasPermission = this.checkRelationshipPermission(
                userRole, 
                relationship, 
                collectionName,
                relationName || ''
              );
              
              if (!hasPermission) {
                return reply.code(403).send({
                  error: 'Insufficient permissions',
                  message: `Access denied to relationship '${relationName}' in collection '${collectionName}'`,
                  relationship: relationName,
                  userRole
                });
              }
            }
          }
        }
        
      } catch (error: any) {
        request.log.error('Relationship permission validation failed:', error);
        return reply.code(500).send({
          error: 'Permission validation failed',
          message: error.message
        });
      }
    };
  }

  /**
   * Check if user has permission to access a relationship
   * @param userRole - User role
   * @param relationship - Relationship definition
   * @param collection - Collection name
   * @param relationName - Relationship name
   * @returns Has permission
   */
  checkRelationshipPermission(
    userRole: string | undefined, 
    relationship: any, 
    collection: string, 
    relationName: string
  ): boolean {
    // For now, use the same permissions as the target collection
    // In the future, you could add relationship-specific permissions
    const targetSchema = this.schemaLoader.getSchema(relationship.collection);
    const targetPermissions = (targetSchema as any)?.mongorest?.permissions;
    
    if (!targetPermissions) {
      return true; // No restrictions defined
    }
    
    // Check read permission on target collection
    const readRoles = targetPermissions.read || [];
    return readRoles.includes(userRole) || readRoles.includes('*');
  }

  /**
   * Create middleware function for caching relationship queries
   * @param cacheClient - Cache client (Redis, etc.)
   * @returns Fastify middleware function
   */
  cacheRelationshipQuery(cacheClient?: CacheClient) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!cacheClient || !request.relationshipQuery) {
        return; // No caching or no relationships
      }

      try {
        const cacheKey = this.generateCacheKey(request);
        const cached = await cacheClient.get(cacheKey);
        
        if (cached) {
          const cachedData = JSON.parse(cached);
          return reply.send({
            success: true,
            data: cachedData.data,
            meta: {
              ...cachedData.meta,
              cached: true,
              cacheHit: true
            }
          });
        }
        
        // Store cache key for later use
        request.cacheKey = cacheKey;
        
      } catch (error: any) {
        request.log.warn('Cache check failed:', error);
        // Continue without caching
      }
    };
  }

  /**
   * Generate cache key for relationship query
   * @param request - Fastify request object
   * @returns Cache key
   */
  generateCacheKey(request: FastifyRequest): string {
    const collection = (request.params as any)?.collection || 
                      request.routerPath?.split('/').pop();
    
    const query = request.query as any;
    const keyData = {
      collection,
      select: query.select,
      filters: request.parsedFilters?.filters,
      relationshipFilters: request.parsedFilters?.relationshipFilters,
      sort: query.sort,
      order: query.order,
      page: query.page,
      limit: query.limit,
      userRole: request.user?.role
    };
    
    const keyString = JSON.stringify(keyData, Object.keys(keyData).sort());
    const hash = crypto.createHash('md5').update(keyString).digest('hex');
    
    return `mongorest:relationships:${collection}:${hash}`;
  }

  /**
   * Create middleware function for logging relationship queries
   * @returns Fastify middleware function
   */
  logRelationshipQueries() {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!request.relationshipQuery) {
        return; // No relationships to log
      }

      const collection = (request.params as any)?.collection || 
                        request.routerPath?.split('/').pop();
      const query = request.query as any;

      const logData = {
        timestamp: new Date().toISOString(),
        collection,
        user: request.user?.sub,
        userRole: request.user?.role,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        relationshipQuery: {
          select: query.select,
          hasRelationships: request.relationshipQuery.hasRelationships,
          fieldCount: request.relationshipQuery.fields?.length || 0,
          relationships: request.relationshipQuery.fields
            ?.filter(f => f.type === 'relationship')
            ?.map(f => f.alias || f.relationName) || []
        },
        filters: {
          direct: Object.keys(request.parsedFilters?.filters || {}).length,
          relationship: Object.keys(request.parsedFilters?.relationshipFilters || {}).length
        }
      };

      request.log.info('Relationship query executed', logData);
      
      // Store for potential analytics
      request.relationshipQueryLog = logData;
    };
  }
}

/**
 * Factory function to create relationship middleware
 * @param schemaLoader - Schema loader instance
 * @returns Middleware functions
 */
function createRelationshipMiddleware(schemaLoader: SchemaLoader) {
  const middleware = new RelationshipMiddleware(schemaLoader);
  
  return {
    parseRelationships: middleware.parseRelationships.bind(middleware),
    validateRelationshipPermissions: middleware.validateRelationshipPermissions.bind(middleware),
    cacheRelationshipQuery: middleware.cacheRelationshipQuery.bind(middleware),
    logRelationshipQueries: middleware.logRelationshipQueries.bind(middleware)
  };
}

export {
  RelationshipMiddleware,
  createRelationshipMiddleware
};

export type { CacheClient };