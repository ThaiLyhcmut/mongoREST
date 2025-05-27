import RelationshipQueryParser from '../core/relationship-parser.js';
import RelationshipFilterParser from '../core/relationship-filter.js';

/**
 * Relationship middleware for parsing and validating relationship queries
 */
class RelationshipMiddleware {
  constructor(schemaLoader) {
    this.schemaLoader = schemaLoader;
    this.relationshipParser = new RelationshipQueryParser(schemaLoader);
    this.filterParser = new RelationshipFilterParser(schemaLoader);
  }

  /**
   * Create middleware function for relationship parsing
   * @returns {Function} Fastify middleware function
   */
  parseRelationships() {
    return async (request, reply) => {
      try {
        const collectionName = request.params.collection
                               || request.routerPath.split('/').pop();

        if (!collectionName) {
          return reply.code(400).send({
            error: 'Collection not specified',
            message: 'Unable to determine collection from request'
          });
        }

        // Parse relationship query if select parameter exists
        if (request.query.select) {
          const selectQuery = this.relationshipParser.parseSelectQuery(
            collectionName,
            request.query.select
          );

          // Validate relationship query
          const errors = this.relationshipParser.validateRelationshipQuery(
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
        const { filters, relationshipFilters, specialFilters }
          = this.filterParser.parseFilters(collectionName, request.query);

        // Validate filters
        const filterErrors = this.filterParser.validateFilters(
          collectionName,
          request.query
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
      } catch (error) {
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
   * @returns {Function} Fastify middleware function
   */
  validateRelationshipPermissions() {
    return async (request, reply) => {
      try {
        const collectionName = request.params.collection
                               || request.routerPath.split('/').pop();

        if (!request.relationshipQuery) {
          return; // No relationships to validate
        }

        const userRole = request.user?.role;
        const schema = this.schemaLoader.getSchema(collectionName);

        // Check permissions for each relationship
        for (const field of request.relationshipQuery.fields) {
          if (field.type === 'relationship' || field.type === 'aggregate') {
            const relationName = field.relationName || field.alias;
            const relationship = schema?.relationships?.[relationName];

            if (relationship) {
              // Check if user has permission to access this relationship
              const hasPermission = this.checkRelationshipPermission(
                userRole,
                relationship,
                collectionName,
                relationName
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
      } catch (error) {
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
   * @param {string} userRole - User role
   * @param {Object} relationship - Relationship definition
   * @param {string} collection - Collection name
   * @param {string} relationName - Relationship name
   * @returns {boolean} Has permission
   */
  checkRelationshipPermission(userRole, relationship, collection, relationName) {
    // For now, use the same permissions as the target collection
    // In the future, you could add relationship-specific permissions
    const targetSchema = this.schemaLoader.getSchema(relationship.collection);
    const targetPermissions = targetSchema?.mongorest?.permissions;

    if (!targetPermissions) {
      return true; // No restrictions defined
    }

    // Check read permission on target collection
    const readRoles = targetPermissions.read || [];
    return readRoles.includes(userRole) || readRoles.includes('*');
  }

  /**
   * Create middleware function for caching relationship queries
   * @param {Object} cacheClient - Cache client (Redis, etc.)
   * @returns {Function} Fastify middleware function
   */
  cacheRelationshipQuery(cacheClient) {
    return async (request, reply) => {
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
      } catch (error) {
        request.log.warn('Cache check failed:', error);
        // Continue without caching
      }
    };
  }

  /**
   * Generate cache key for relationship query
   * @param {Object} request - Fastify request object
   * @returns {string} Cache key
   */
  generateCacheKey(request) {
    const collection = request.params.collection
                      || request.routerPath.split('/').pop();

    const keyData = {
      collection,
      select: request.query.select,
      filters: request.parsedFilters?.filters,
      relationshipFilters: request.parsedFilters?.relationshipFilters,
      sort: request.query.sort,
      order: request.query.order,
      page: request.query.page,
      limit: request.query.limit,
      userRole: request.user?.role
    };

    const keyString = JSON.stringify(keyData, Object.keys(keyData).sort());
    const crypto = require('crypto');
    const hash = crypto.createHash('md5').update(keyString).digest('hex');

    return `mongorest:relationships:${collection}:${hash}`;
  }

  /**
   * Create middleware function for logging relationship queries
   * @returns {Function} Fastify middleware function
   */
  logRelationshipQueries() {
    return async (request, reply) => {
      if (!request.relationshipQuery) {
        return; // No relationships to log
      }

      const logData = {
        timestamp: new Date().toISOString(),
        collection: request.params.collection || request.routerPath.split('/').pop(),
        user: request.user?.sub,
        userRole: request.user?.role,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        relationshipQuery: {
          select: request.query.select,
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
 * @param {Object} schemaLoader - Schema loader instance
 * @returns {Object} Middleware functions
 */
function createRelationshipMiddleware(schemaLoader) {
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
