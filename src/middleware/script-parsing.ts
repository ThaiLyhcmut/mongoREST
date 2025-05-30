// Script Parsing Middleware - Parse MongoDB scripts from request bodies
import { FastifyRequest, FastifyReply } from 'fastify';
import MongoScriptParser from '../core/script-parser';

import {
  ScriptRequestBody,
  ParserResult,
  ParsedScript
} from '../config/middleware/script-pasing.config';

import { UserContext } from '../config/middleware/auth.config';
// Extend FastifyRequest to include script parsing properties
declare module 'fastify' {
  interface FastifyRequest {
    parsedScript?: ParsedScript;
    isScriptRequest?: boolean;
    scriptContext?: {
      originalScript: string;
      parseTime: number;
      validated: boolean;
    };
    mongoOperation?: string;
    scriptAnalysis?: {
      readOperations: number;
      writeOperations: number;
      aggregationStages: number;
      indexHints: number;
      crossCollectionRefs: boolean;
    };
    user: UserContext
  }
}

interface ScriptRateLimitData {
  count: number;
  complexitySum: number;
  windowStart: number;
}

interface UserLimits {
  maxScripts: number;
  maxComplexity: number;
}

class ScriptParsingMiddleware {
  private parser: MongoScriptParser;
  private scriptCounts: Map<string, ScriptRateLimitData> = new Map();

  constructor() {
    this.parser = new MongoScriptParser();
  }

  // Middleware to detect and parse MongoDB scripts in request body
  parseMongoScript() {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        const body = (request.body as ScriptRequestBody) || {};
        
        // Check if request contains a MongoDB script
        if (this.isScriptRequest(body)) {
          const script = body.script || body.mongoScript || body.query;
          
          if (!script) {
            return reply.code(400).send({
              error: 'Invalid script request',
              message: 'Script content is required but was empty'
            });
          }
          
          // Parse script to parameters
          const parsed = this.parser.parseAndPrepare(script);
          
          // Store parsed result in request context
          request.parsedScript = parsed;
          request.isScriptRequest = true;
          
          // Override collection parameter if parsed from script
          if (parsed.collection && !(request.params as any)?.collection) {
            (request.params as any) = { ...(request.params || {}), collection: parsed.collection };
          }
          
          // Override operation if needed
          if (parsed.operation) {
            request.mongoOperation = parsed.operation;
          }
          
          // Merge parsed parameters with existing body
          request.body = {
            ...(body as object),
            ...parsed.params,
            _originalScript: script,
            _scriptMeta: parsed.meta
          };
          
          request.log.info('MongoDB script parsed successfully', {
            collection: parsed.collection,
            operation: parsed.operation,
            complexity: parsed.meta?.complexity || 0
          });
        }
        
      } catch (error: any) {
        request.log.error('Script parsing failed:', error);
        
        return reply.code(400).send({
          error: 'Script parsing failed',
          message: error.message,
          type: 'SCRIPT_PARSE_ERROR'
        });
      }
    };
  }

  // Check if request contains MongoDB script
  isScriptRequest(body: ScriptRequestBody): boolean {
    return !!(
      body.script || 
      body.mongoScript || 
      (body.query && typeof body.query === 'string' && body.query.includes('db.'))
    );
  }

  // Middleware for script-specific validation
  validateScript() {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!request.isScriptRequest) {
        return; // Skip if not a script request
      }

      const parsed = request.parsedScript;
      
      if (!parsed) {
        return reply.code(400).send({
          error: 'Script validation failed',
          message: 'No parsed script found',
          type: 'SCRIPT_VALIDATION_ERROR'
        });
      }

      try {
        // Check complexity limits
        await this.checkComplexityLimits(parsed, request.user);
        
        // Check collection access
        const authManager = (request as any).context?.authManager;
        if (authManager) {
          await this.checkScriptCollectionAccess(parsed, request.user, authManager);
          
          // Check operation permissions
          await this.checkScriptOperationPermissions(parsed, request.user, authManager);
        }
        
      } catch (error: any) {
        return reply.code(403).send({
          error: 'Script validation failed',
          message: error.message,
          type: 'SCRIPT_VALIDATION_ERROR'
        });
      }
    };
  }

  // Check script complexity against user limits
  async checkComplexityLimits(parsed: ParsedScript, user: any): Promise<void> {
    const userRole = user?.role || 'user';
    const complexity = parsed.meta?.complexity || 0;
    
    // Define complexity limits per role
    const complexityLimits: { [key: string]: number } = {
      admin: 10,
      dev: 8,
      analyst: 6,
      user: 4
    };
    
    const maxComplexity = complexityLimits[userRole] || 2;
    
    if (complexity > maxComplexity) {
      throw new Error(`Script complexity (${complexity}) exceeds limit (${maxComplexity}) for role '${userRole}'`);
    }
  }

  // Check access to collections referenced in script
  async checkScriptCollectionAccess(parsed: ParsedScript, user: any, authManager: any): Promise<void> {
    const collections = parsed.meta?.collections || [];
    const operation = this.getOperationType(parsed.operation);
    
    for (const collection of collections) {
      if (!authManager.canAccessCollection(user, collection, operation)) {
        throw new Error(`Access denied to collection '${collection}' for operation '${operation}'`);
      }
    }
  }

  // Check operation permissions
  async checkScriptOperationPermissions(parsed: ParsedScript, user: any, authManager: any): Promise<void> {
    const operation = parsed.operation;
    const operationType = this.getOperationType(operation);
    
    if (!authManager.hasPermission(user, operationType)) {
      throw new Error(`Permission denied for operation '${operation}'`);
    }
  }

  // Map MongoDB operations to permission types
  getOperationType(operation: string): string {
    const operationMap: { [key: string]: string } = {
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
      aggregate: 'read' // Default to read, but may be write depending on pipeline
    };
    
    return operationMap[operation] || 'read';
  }

  // Middleware to log script execution
  logScriptExecution() {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!request.isScriptRequest) {
        return;
      }

      const parsed = request.parsedScript;
      
      if (!parsed) {
        return;
      }

      // Log script execution attempt
      const logEntry = {
        timestamp: new Date().toISOString(),
        user: request.user?.sub,
        userRole: request.user?.role,
        script: parsed.meta?.originalScript,
        collection: parsed.collection,
        operation: parsed.operation,
        complexity: parsed.meta?.complexity,
        ip: request.ip,
        userAgent: request.headers['user-agent']
      };
      
      request.log.info('MongoDB script execution', logEntry);
      
      // In production, you might want to store this in a dedicated audit log
      // await this.storeAuditLog(logEntry);
    };
  }

  // Create middleware to enhance response with script information
  enhanceScriptResponse() {
    return async (request: FastifyRequest, reply: any): Promise<void> => {
      if (!request.isScriptRequest) {
        return;
      }

      // Add hook to enhance response
      reply.addHook('onSend', async (request: FastifyRequest, payload: any) => {
        try {
          const response = JSON.parse(payload as string);
          
          // Add script metadata to response
          if (response && typeof response === 'object' && request.parsedScript) {
            response.script = {
              original: request.parsedScript.meta?.originalScript,
              parsed: this.parser.parametersToScript(
                request.parsedScript.collection,
                request.parsedScript.operation,
                request.parsedScript.params
              ),
              complexity: request.parsedScript.meta?.complexity,
              collections: request.parsedScript.meta?.collections
            };
          }
          
          return JSON.stringify(response);
        } catch (error) {
          // If response is not JSON, return as-is
          return payload;
        }
      });
    };
  }

  // Middleware to handle script format conversion
  handleScriptFormats() {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const contentType = request.headers['content-type'];
      
      // Handle different script formats
      if (contentType && contentType.includes('text/javascript')) {
        // Raw JavaScript/MongoDB shell script
        const scriptContent = (request.body as Buffer).toString();
        request.body = { script: scriptContent };
      } else if (contentType && contentType.includes('application/x-mongodb-script')) {
        // Custom MongoDB script content type
        const scriptContent = (request.body as Buffer).toString();
        request.body = { mongoScript: scriptContent };
      }
    };
  }

  // Create rate limiting middleware for scripts
  scriptRateLimit() {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!request.isScriptRequest) {
        return;
      }

      const userId = request.user?.sub;
      const complexity = request.parsedScript?.meta?.complexity || 1;
      
      if (!userId) return;
      
      const key = `script_rate_limit:${userId}`;
      const window = 60 * 1000; // 1 minute window
      const now = Date.now();
      
      // Get current counts
      let userCounts = this.scriptCounts.get(key) || { count: 0, complexitySum: 0, windowStart: now };
      
      // Reset if window expired
      if (now - userCounts.windowStart > window) {
        userCounts = { count: 0, complexitySum: 0, windowStart: now };
      }
      
      // Define limits based on user role
      const limits: { [key: string]: UserLimits } = {
        admin: { maxScripts: 100, maxComplexity: 200 },
        dev: { maxScripts: 50, maxComplexity: 100 },
        analyst: { maxScripts: 30, maxComplexity: 60 },
        user: { maxScripts: 10, maxComplexity: 20 }
      };
      
      const userLimits = limits[request.user?.role || 'user'] || limits.user;
      
      // Check limits
      if (userCounts.count >= userLimits.maxScripts) {
        return reply.code(429).send({
          error: 'Script rate limit exceeded',
          message: `Maximum ${userLimits.maxScripts} scripts per minute`,
          type: 'SCRIPT_RATE_LIMIT_EXCEEDED'
        });
      }
      
      if (userCounts.complexitySum + complexity > userLimits.maxComplexity) {
        return reply.code(429).send({
          error: 'Script complexity limit exceeded',
          message: `Maximum complexity ${userLimits.maxComplexity} per minute`,
          type: 'SCRIPT_COMPLEXITY_LIMIT_EXCEEDED'
        });
      }
      
      // Update counts
      userCounts.count += 1;
      userCounts.complexitySum += complexity;
      this.scriptCounts.set(key, userCounts);
      
      // Clean up old entries periodically
      if (Math.random() < 0.1) {
        this.cleanupRateLimitCache(this.scriptCounts, window);
      }
    };
  }

  // Clean up expired rate limit entries
  cleanupRateLimitCache(cache: Map<string, ScriptRateLimitData>, window: number): void {
    const now = Date.now();
    for (const [key, data] of cache.entries()) {
      if (now - data.windowStart > window * 2) {
        cache.delete(key);
      }
    }
  }

  // Create script analysis middleware
  analyzeScript() {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!request.isScriptRequest) {
        return;
      }

      const parsed = request.parsedScript;
      
      if (!parsed) {
        return;
      }

      const analysis = {
        readOperations: 0,
        writeOperations: 0,
        aggregationStages: 0,
        indexHints: 0,
        crossCollectionRefs: (parsed.meta?.collections?.length || 0) > 1
      };

      // Analyze operation type
      const writeOps = ['insertOne', 'insertMany', 'updateOne', 'updateMany', 'replaceOne', 'deleteOne', 'deleteMany'];
      if (writeOps.includes(parsed.operation)) {
        analysis.writeOperations++;
      } else {
        analysis.readOperations++;
      }

      // Analyze aggregation pipeline
      if (parsed.operation === 'aggregate' && parsed.params.pipeline) {
        analysis.aggregationStages = Array.isArray(parsed.params.pipeline) ? parsed.params.pipeline.length : 0;
      }

      // Store analysis in request context
      request.scriptAnalysis = analysis;
      
      request.log.debug('Script analysis completed', analysis);
    };
  }

  // Middleware to transform script parameters for CRUD operations
  transformScriptParams() {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!request.isScriptRequest || !request.parsedScript) {
        return; // Skip if not a script request
      }

      try {
        const parsed = request.parsedScript;
        const transformedBody: { [key: string]: any } = {};
        
        // Transform based on operation type
        switch (parsed.operation) {
          case 'find':
          case 'findOne':
            // Transform query parameters
            if (parsed.params.filter) {
              Object.assign(transformedBody, parsed.params.filter);
            }
            if (parsed.params.sort) {
              transformedBody._sort = this.transformSortParams(parsed.params.sort);
            }
            if (parsed.params.limit) {
              transformedBody._limit = parsed.params.limit;
            }
            if (parsed.params.skip) {
              transformedBody._offset = parsed.params.skip;
            }
            if (parsed.params.projection) {
              transformedBody._select = this.transformProjectionParams(parsed.params.projection);
            }
            break;
            
          case 'insertOne':
          case 'insertMany':
            // Use document data directly
            if (parsed.params.document) {
              Object.assign(transformedBody, parsed.params.document);
            } else if (parsed.params.documents) {
              transformedBody.documents = parsed.params.documents;
            }
            break;
            
          case 'updateOne':
          case 'updateMany':
            // Split filter and update operations
            if (parsed.params.filter) {
              transformedBody._filter = parsed.params.filter;
            }
            if (parsed.params.update) {
              Object.assign(transformedBody, this.transformUpdateParams(parsed.params.update));
            }
            break;
            
          case 'deleteOne':
          case 'deleteMany':
            // Use filter parameters
            if (parsed.params.filter) {
              Object.assign(transformedBody, parsed.params.filter);
            }
            break;
            
          case 'aggregate':
            // Transform pipeline
            if (parsed.params.pipeline) {
              transformedBody.pipeline = parsed.params.pipeline;
            }
            break;
            
          default:
            // Use parameters as-is for unknown operations
            Object.assign(transformedBody, parsed.params);
        }
        
        // Preserve original body properties and script metadata
        request.body = {
          ...(request.body as object),
          ...transformedBody,
          _originalScript: request.scriptContext?.originalScript,
          _scriptMeta: parsed.meta,
          _transformedAt: new Date().toISOString()
        };
        
        request.log.info('Script parameters transformed', {
          operation: parsed.operation,
          paramCount: Object.keys(parsed.params).length,
          transformedCount: Object.keys(transformedBody).length
        });
        
      } catch (error: any) {
        request.log.error('Script parameter transformation failed:', error);
        return reply.code(500).send({
          error: 'Parameter transformation failed',
          message: error.message
        });
      }
    };
  }

  // Transform MongoDB sort parameters to REST API format
  private transformSortParams(sort: any): string {
    if (typeof sort === 'string') {
      return sort;
    }
    
    if (typeof sort === 'object') {
      return Object.entries(sort)
        .map(([field, direction]) => `${direction === -1 ? '-' : ''}${field}`)
        .join(',');
    }
    
    return '';
  }

  // Transform MongoDB projection parameters to REST API format
  private transformProjectionParams(projection: any): string {
    if (typeof projection === 'string') {
      return projection;
    }
    
    if (typeof projection === 'object') {
      return Object.entries(projection)
        .filter(([, include]) => include === 1)
        .map(([field]) => field)
        .join(',');
    }
    
    return '';
  }

  // Transform MongoDB update operations to REST API format
  private transformUpdateParams(update: any): { [key: string]: any } {
    const transformed: { [key: string]: any } = {};
    
    if (update.$set) {
      Object.assign(transformed, update.$set);
    }
    
    if (update.$inc) {
      // Transform increment operations
      for (const [field, value] of Object.entries(update.$inc)) {
        transformed[`${field}_increment`] = value;
      }
    }
    
    if (update.$push) {
      // Transform array push operations
      for (const [field, value] of Object.entries(update.$push)) {
        transformed[`${field}_push`] = value;
      }
    }
    
    if (update.$pull) {
      // Transform array pull operations
      for (const [field, value] of Object.entries(update.$pull)) {
        transformed[`${field}_pull`] = value;
      }
    }
    
    // For simple updates without operators, use as-is
    if (!update.$set && !update.$inc && !update.$push && !update.$pull) {
      Object.assign(transformed, update);
    }
    
    return transformed;
  }

  // Get parser instance for external use
  getParser(): MongoScriptParser {
    return this.parser;
  }
}

export default ScriptParsingMiddleware;