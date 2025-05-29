// Relationship Middleware - Parse and validate relationship queries
import { FastifyRequest, FastifyReply } from 'fastify';
import RelationshipQueryParser from '../core/relationship-parser.js';
import RelationshipFilterParser from '../core/relationship-filter.js';
import crypto from 'crypto';

interface RelationshipQuery {
  fields: string[];
  expand: string[];
  filters: { [field: string]: any };
  sort: { [field: string]: 1 | -1 };
  limit: number;
  offset: number;
}

interface ParsedSelectQuery {
  fields: string[];
  relationships: string[];
  depth: number;
}

interface RelationshipValidationError {
  field: string;
  error: string;
  suggestion?: string;
}

interface RelationshipContext {
  collection: string;
  query: RelationshipQuery;
  validation: {
    isValid: boolean;
    errors: RelationshipValidationError[];
  };
  optimization: {
    cacheKey: string;
    estimatedCost: number;
    canOptimize: boolean;
  };
}

// Extend FastifyRequest to include relationship properties
declare module 'fastify' {
  interface FastifyRequest {
    relationshipContext?: RelationshipContext;
    expandFields?: string[];
    relationshipCache?: {
      key: string;
      ttl: number;
    };
  }
}

/**
 * Relationship middleware for parsing and validating relationship queries
 */
class RelationshipMiddleware {
  private schemaLoader: any;
  private relationshipParser: RelationshipQueryParser;
  private filterParser: RelationshipFilterParser;

  constructor(schemaLoader: any) {
    this.schemaLoader = schemaLoader;
    this.relationshipParser = new RelationshipQueryParser(schemaLoader);
    this.filterParser = new RelationshipFilterParser(schemaLoader);
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
          const selectQuery = this.relationshipParser.parseSelectQuery(
            collectionName, 
            query.select
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

          // Store relationship context
          request.relationshipContext = {
            collection: collectionName,
            query: {
              fields: selectQuery.fields,
              expand: query.expand ? query.expand.split(',') : [],
              filters: this.extractRelationshipFilters(query),
              sort: this.parseSort(query.sort),
              limit: parseInt(query.limit) || 100,
              offset: parseInt(query.offset) || 0
            },
            validation: {
              isValid: true,
              errors: []
            },
            optimization: {
              cacheKey: this.generateCacheKey(collectionName, selectQuery),
              estimatedCost: this.estimateQueryCost(selectQuery),
              canOptimize: this.canOptimizeQuery(selectQuery)
            }
          };

          // Set expand fields for population
          request.expandFields = selectQuery.relationships;
          
          request.log.info('Relationship query parsed successfully', {
            collection: collectionName,
            fields: selectQuery.fields.length,
            relationships: selectQuery.relationships.length,
            depth: selectQuery.depth
          });
        }

        // Parse relationship filters if present
        if (query.filter) {
          const filterQuery = this.filterParser.parseFilterQuery(
            collectionName,
            query.filter
          );
          
          // Validate filter query
          const filterErrors = this.filterParser.validateFilterQuery(
            collectionName,
            filterQuery
          );
          
          if (filterErrors.length > 0) {
            return reply.code(400).send({
              error: 'Invalid relationship filter',
              message: 'Relationship filter validation failed',
              details: filterErrors
            });
          }

          // Add filter context to existing relationship context
          if (request.relationshipContext) {
            request.relationshipContext.query.filters = {
              ...request.relationshipContext.query.filters,
              ...filterQuery
            };
          } else {
            request.relationshipContext = {
              collection: collectionName,
              query: {
                fields: [],
                expand: [],
                filters: filterQuery,
                sort: {},
                limit: 100,
                offset: 0
              },
              validation: {
                isValid: true,
                errors: []
              },
              optimization: {
                cacheKey: this.generateCacheKey(collectionName, { fields: [] }),
                estimatedCost: 1,
                canOptimize: false
              }
            };
          }
        }

      } catch (error: any) {
        request.log.error('Relationship parsing failed:', error);
        return reply.code(400).send({
          error: 'Relationship parsing failed',
          message: error.message,
          details: this.getParsingErrorDetails(error)
        });
      }
    };
  }

  /**
   * Middleware to validate relationship depth and complexity
   */
  validateRelationshipComplexity() {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!request.relationshipContext) {
        return; // Skip if no relationship context
      }

      try {
        const context = request.relationshipContext;
        const maxDepth = parseInt(process.env.MAX_RELATIONSHIP_DEPTH || '3');
        const maxRelationships = parseInt(process.env.MAX_RELATIONSHIPS_PER_QUERY || '10');
        const maxCost = parseInt(process.env.MAX_QUERY_COST || '100');

        // Check depth limit
        const queryDepth = this.calculateQueryDepth(context.query.fields);
        if (queryDepth > maxDepth) {
          return reply.code(400).send({
            error: 'Relationship depth exceeded',
            message: `Query depth ${queryDepth} exceeds maximum allowed depth ${maxDepth}`,
            suggestion: 'Reduce relationship nesting or increase MAX_RELATIONSHIP_DEPTH'
          });
        }

        // Check relationship count limit
        const relationshipCount = context.query.expand.length;
        if (relationshipCount > maxRelationships) {
          return reply.code(400).send({
            error: 'Too many relationships',
            message: `Query includes ${relationshipCount} relationships, maximum allowed is ${maxRelationships}`,
            suggestion: 'Reduce number of expanded relationships'
          });
        }

        // Check estimated cost limit
        if (context.optimization.estimatedCost > maxCost) {
          return reply.code(429).send({
            error: 'Query complexity too high',
            message: `Estimated query cost ${context.optimization.estimatedCost} exceeds maximum ${maxCost}`,
            suggestion: 'Simplify query or use pagination'
          });
        }

        request.log.info('Relationship complexity validation passed', {
          depth: queryDepth,
          relationships: relationshipCount,
          estimatedCost: context.optimization.estimatedCost
        });

      } catch (error: any) {
        request.log.error('Relationship complexity validation failed:', error);
        return reply.code(500).send({
          error: 'Complexity validation error',
          message: error.message
        });
      }
    };
  }

  /**
   * Middleware to setup relationship caching
   */
  setupRelationshipCaching() {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!request.relationshipContext || !request.relationshipContext.optimization.canOptimize) {
        return; // Skip if no relationship context or can't optimize
      }

      try {
        const context = request.relationshipContext;
        const cacheEnabled = process.env.RELATIONSHIP_CACHE_ENABLED === 'true';
        const cacheTTL = parseInt(process.env.RELATIONSHIP_CACHE_TTL || '300'); // 5 minutes default

        if (cacheEnabled) {
          request.relationshipCache = {
            key: context.optimization.cacheKey,
            ttl: cacheTTL
          };

          request.log.info('Relationship caching setup', {
            cacheKey: context.optimization.cacheKey,
            ttl: cacheTTL
          });
        }

      } catch (error: any) {
        // Log error but don't fail request - caching is optional
        request.log.warn('Relationship caching setup failed:', error);
      }
    };
  }

  /**
   * Extract relationship-specific filters from query parameters
   */
  private extractRelationshipFilters(query: any): { [field: string]: any } {
    const filters: { [field: string]: any } = {};
    
    // Extract filters for relationship fields
    for (const [key, value] of Object.entries(query)) {
      if (key.includes('.') && !['select', 'expand', 'sort', 'limit', 'offset'].includes(key)) {
        filters[key] = value;
      }
    }

    return filters;
  }

  /**
   * Parse sort parameter into object format
   */
  private parseSort(sortParam: string): { [field: string]: 1 | -1 } {
    const sort: { [field: string]: 1 | -1 } = {};
    
    if (!sortParam) return sort;

    const sortFields = sortParam.split(',');
    for (const field of sortFields) {
      const trimmed = field.trim();
      if (trimmed.startsWith('-')) {
        sort[trimmed.substring(1)] = -1;
      } else {
        sort[trimmed] = 1;
      }
    }

    return sort;
  }

  /**
   * Generate cache key for relationship query
   */
  private generateCacheKey(collection: string, selectQuery: ParsedSelectQuery): string {
    const data = {
      collection,
      fields: selectQuery.fields.sort(),
      relationships: selectQuery.relationships.sort()
    };
    
    return crypto
      .createHash('md5')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  /**
   * Estimate query cost based on complexity
   */
  private estimateQueryCost(selectQuery: ParsedSelectQuery): number {
    let cost = 1; // Base cost
    
    // Add cost for each field
    cost += selectQuery.fields.length * 0.1;
    
    // Add cost for each relationship
    cost += selectQuery.relationships.length * 5;
    
    // Add cost for depth
    cost += selectQuery.depth * 10;
    
    return Math.round(cost);
  }

  /**
   * Check if query can be optimized/cached
   */
  private canOptimizeQuery(selectQuery: ParsedSelectQuery): boolean {
    // Don't optimize very simple or very complex queries
    return selectQuery.relationships.length > 0 && 
           selectQuery.relationships.length <= 5 &&
           selectQuery.depth <= 2;
  }

  /**
   * Calculate maximum depth of relationship query
   */
  private calculateQueryDepth(fields: string[]): number {
    let maxDepth = 0;
    
    for (const field of fields) {
      const depth = field.split('.').length - 1;
      maxDepth = Math.max(maxDepth, depth);
    }
    
    return maxDepth;
  }

  /**
   * Get detailed parsing error information
   */
  private getParsingErrorDetails(error: any): { [key: string]: any } {
    return {
      type: error.name || 'RelationshipParseError',
      field: error.field,
      expectedFormat: error.expectedFormat,
      suggestion: this.getSuggestionForError(error)
    };
  }

  /**
   * Get suggestion for relationship parsing errors
   */
  private getSuggestionForError(error: any): string {
    if (error.message.includes('field not found')) {
      return 'Check field names and ensure they exist in the schema';
    }
    
    if (error.message.includes('relationship not defined')) {
      return 'Ensure relationship is defined in the collection schema';
    }
    
    if (error.message.includes('circular reference')) {
      return 'Avoid circular relationships or limit query depth';
    }
    
    if (error.message.includes('invalid syntax')) {
      return 'Use dot notation for nested fields: field.subfield';
    }
    
    return 'Check relationship query syntax and try again';
  }
}

export default RelationshipMiddleware;
