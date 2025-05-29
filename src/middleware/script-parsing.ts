// Script Parsing Middleware - Parse MongoDB scripts from request bodies
import { FastifyRequest, FastifyReply } from 'fastify';
import MongoScriptParser from '../core/script-parser.js';

interface ScriptRequestBody {
  script?: string;
  mongoScript?: string;
  query?: string;
  [key: string]: any;
}

interface ParserResult {
  collection: any;
  operation: any;
  params: any;
  meta?: {
    originalScript: string;
    complexity: number;
    collections: string[];
    parsedAt: string;
  };
}

interface ParsedScript {
  collection: string;
  operation: string;
  params: { [key: string]: any };
  meta: {
    originalScript: string;
    complexity: number;
    collections: string[];
    parsedAt: string;
  };
}

// Extend FastifyRequest to include script parsing properties
declare module 'fastify' {
  interface FastifyRequest {
    scriptParsed?: ParsedScript;
    isScriptRequest?: boolean;
    scriptContext?: {
      originalScript: string;
      parseTime: number;
      validated: boolean;
    };
    mongoOperation?: string;
  }
}

class ScriptParsingMiddleware {
  private parser: MongoScriptParser;

  constructor() {
    this.parser = new MongoScriptParser();
  }

  // Middleware to detect and parse MongoDB scripts in request body
  parseMongoScript() {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        const body = request.body as ScriptRequestBody || {};
        
        // Check if request contains a MongoDB script
        if (this.isScriptRequest(body)) {
          const startTime = Date.now();
          const script = body.script || body.mongoScript || body.query;
          
          if (!script) {
            return reply.code(400).send({
              error: 'Invalid script request',
              message: 'Script content is required but was empty'
            });
          }
            // Parse script to parameters
          const result: ParserResult = this.parser.parseAndPrepare(script);
          
          // The parser returns an object with collection, operation, params, and meta
          const parsed: ParsedScript = {
            collection: result.collection,
            operation: result.operation,
            params: result.params,
            meta: result.meta
          };
            // Store parsed result in request context
          request.scriptParsed = parsed;
          request.isScriptRequest = true;
          request.scriptContext = {
            originalScript: script,
            parseTime: Date.now() - startTime,
            validated: true
          };
          
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
            complexity: parsed.meta.complexity,
            parseTime: request.scriptContext.parseTime
          });
        }
        
      } catch (error: any) {
        request.log.error('Script parsing failed:', error);
        
        // Determine if we should reject or continue
        if (this.isScriptRequest(request.body as ScriptRequestBody)) {
          return reply.code(400).send({
            error: 'Script parsing failed',
            message: error.message,
            details: this.getParsingErrorDetails(error)
          });
        }
        
        // If not a script request, continue normally
        return;
      }
    };
  }
  // Middleware to validate parsed scripts
  validateParsedScript() {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!request.isScriptRequest || !request.scriptParsed) {
        return; // Skip if not a script request
      }

      try {
        const parsed = request.scriptParsed;
        
        // Basic script validation (security is handled by parser during parsing)
        // If we reach here, the script passed basic security validation
        
        // Complexity validation - convert number to complexity level
        const complexityLevel = this.getComplexityLevel(parsed.meta.complexity);
        const maxComplexity = process.env.MAX_SCRIPT_COMPLEXITY || 'high';
        if (this.isComplexityExceeded(complexityLevel, maxComplexity)) {
          return reply.code(429).send({
            error: 'Script complexity exceeded',
            message: `Script complexity '${complexityLevel}' exceeds maximum allowed '${maxComplexity}'`,
            complexityScore: parsed.meta.complexity
          });
        }
        
        // Collection validation
        const schemaLoader = (request.server as any).schemaLoader;
        if (parsed.collection && !schemaLoader.hasCollection(parsed.collection)) {
          return reply.code(404).send({
            error: 'Collection not found',
            message: `Collection '${parsed.collection}' does not exist`,
            availableCollections: Array.from(schemaLoader.collections.keys())
          });
        }
        
        request.log.info('Script validation passed', {
          collection: parsed.collection,
          operation: parsed.operation,
          complexity: complexityLevel,
          complexityScore: parsed.meta.complexity
        });
        
      } catch (error: any) {
        request.log.error('Script validation failed:', error);
        return reply.code(500).send({
          error: 'Script validation error',
          message: error.message
        });
      }
    };
  }
  // Middleware to transform script parameters for CRUD operations
  transformScriptParams() {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!request.isScriptRequest || !request.scriptParsed) {
        return; // Skip if not a script request
      }

      try {
        const parsed = request.scriptParsed;
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

  // Check if request body contains a MongoDB script
  private isScriptRequest(body: ScriptRequestBody): boolean {
    return !!(body.script || body.mongoScript || body.query);
  }
  // Get detailed parsing error information
  private getParsingErrorDetails(error: any): { [key: string]: any } {
    return {
      type: error.name || 'ParseError',
      line: error.line,
      column: error.column,
      expected: error.expected,
      found: error.found,
      suggestion: this.getSuggestionForError(error)
    };
  }

  // Convert numeric complexity score to level
  private getComplexityLevel(score: number): string {
    if (score <= 3) return 'low';
    if (score <= 6) return 'medium';
    if (score <= 10) return 'high';
    return 'extreme';
  }

  // Check if script complexity exceeds allowed level
  private isComplexityExceeded(scriptComplexity: string, maxComplexity: string): boolean {
    const complexityLevels = ['low', 'medium', 'high', 'extreme'];
    const scriptLevel = complexityLevels.indexOf(scriptComplexity);
    const maxLevel = complexityLevels.indexOf(maxComplexity);
    
    return scriptLevel > maxLevel;
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

  // Get suggestion for parsing errors
  private getSuggestionForError(error: any): string {
    if (error.message.includes('find')) {
      return 'Check syntax: db.collection.find({filter}, {projection})';
    }
    
    if (error.message.includes('insert')) {
      return 'Check syntax: db.collection.insertOne({document})';
    }
    
    if (error.message.includes('update')) {
      return 'Check syntax: db.collection.updateOne({filter}, {$set: {update}})';
    }
    
    if (error.message.includes('delete')) {
      return 'Check syntax: db.collection.deleteOne({filter})';
    }
    
    if (error.message.includes('aggregate')) {
      return 'Check syntax: db.collection.aggregate([{$match: {}}, {$group: {}}])';
    }
    
    return 'Verify MongoDB query syntax and try again';
  }
}

export default ScriptParsingMiddleware;
