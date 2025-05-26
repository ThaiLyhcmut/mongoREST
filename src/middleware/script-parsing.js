const MongoScriptParser = require('../core/script-parser');

class ScriptParsingMiddleware {
  constructor() {
    this.parser = new MongoScriptParser();
  }

  // Middleware to detect and parse MongoDB scripts in request body
  parseMongoScript() {
    return async (request, reply) => {
      try {
        const body = request.body || {};
        
        // Check if request contains a MongoDB script
        if (this.isScriptRequest(body)) {
          const script = body.script || body.mongoScript || body.query;
          
          // Parse script to parameters
          const parsed = this.parser.parseAndPrepare(script);
          
          // Store parsed result in request context
          request.parsedScript = parsed;
          request.isScriptRequest = true;
          
          // Override collection parameter if parsed from script
          if (parsed.collection && !request.params.collection) {
            request.params.collection = parsed.collection;
          }
          
          // Override operation if needed
          if (parsed.operation) {
            request.mongoOperation = parsed.operation;
          }
          
          // Merge parsed parameters with existing body
          request.body = {
            ...body,
            ...parsed.params,
            _originalScript: script,
            _scriptMeta: parsed.meta
          };
          
          request.log.info('MongoDB script parsed successfully', {
            collection: parsed.collection,
            operation: parsed.operation,
            complexity: parsed.meta.complexity
          });
        }
        
      } catch (error) {
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
  isScriptRequest(body) {
    return !!(
      body.script || 
      body.mongoScript || 
      (body.query && typeof body.query === 'string' && body.query.includes('db.'))
    );
  }

  // Middleware for script-specific validation
  validateScript() {
    return async (request, reply) => {
      if (!request.isScriptRequest) {
        return; // Skip if not a script request
      }

      const parsed = request.parsedScript;
      
      try {
        // Check complexity limits
        await this.checkComplexityLimits(parsed, request.user);
        
        // Check collection access
        await this.checkScriptCollectionAccess(parsed, request.user, request.context.authManager);
        
        // Check operation permissions
        await this.checkScriptOperationPermissions(parsed, request.user, request.context.authManager);
        
      } catch (error) {
        return reply.code(403).send({
          error: 'Script validation failed',
          message: error.message,
          type: 'SCRIPT_VALIDATION_ERROR'
        });
      }
    };
  }

  // Check script complexity against user limits
  async checkComplexityLimits(parsed, user) {
    const userRole = user.role;
    const complexity = parsed.meta.complexity;
    
    // Define complexity limits per role
    const complexityLimits = {
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
  async checkScriptCollectionAccess(parsed, user, authManager) {
    const collections = parsed.meta.collections;
    const operation = this.getOperationType(parsed.operation);
    
    for (const collection of collections) {
      if (!authManager.canAccessCollection(user, collection, operation)) {
        throw new Error(`Access denied to collection '${collection}' for operation '${operation}'`);
      }
    }
  }

  // Check operation permissions
  async checkScriptOperationPermissions(parsed, user, authManager) {
    const operation = parsed.operation;
    const operationType = this.getOperationType(operation);
    
    if (!authManager.hasPermission(user, operationType)) {
      throw new Error(`Permission denied for operation '${operation}'`);
    }
  }

  // Map MongoDB operations to permission types
  getOperationType(operation) {
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
      aggregate: 'read' // Default to read, but may be write depending on pipeline
    };
    
    return operationMap[operation] || 'read';
  }

  // Middleware to log script execution
  logScriptExecution() {
    return async (request, reply) => {
      if (!request.isScriptRequest) {
        return;
      }

      const parsed = request.parsedScript;
      
      // Log script execution attempt
      const logEntry = {
        timestamp: new Date().toISOString(),
        user: request.user?.sub,
        userRole: request.user?.role,
        script: parsed.meta.originalScript,
        collection: parsed.collection,
        operation: parsed.operation,
        complexity: parsed.meta.complexity,
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
    return async (request, reply) => {
      if (!request.isScriptRequest) {
        return;
      }

      // Add hook to enhance response
      reply.addHook('onSend', async (request, reply, payload) => {
        try {
          const response = JSON.parse(payload);
          
          // Add script metadata to response
          if (response && typeof response === 'object') {
            response.script = {
              original: request.parsedScript.meta.originalScript,
              parsed: this.parser.parametersToScript(
                request.parsedScript.collection,
                request.parsedScript.operation,
                request.parsedScript.params
              ),
              complexity: request.parsedScript.meta.complexity,
              collections: request.parsedScript.meta.collections
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
    return async (request, reply) => {
      const contentType = request.headers['content-type'];
      
      // Handle different script formats
      if (contentType && contentType.includes('text/javascript')) {
        // Raw JavaScript/MongoDB shell script
        const scriptContent = request.body.toString();
        request.body = { script: scriptContent };
      } else if (contentType && contentType.includes('application/x-mongodb-script')) {
        // Custom MongoDB script content type
        const scriptContent = request.body.toString();
        request.body = { mongoScript: scriptContent };
      }
    };
  }

  // Create rate limiting middleware for scripts
  scriptRateLimit() {
    const scriptCounts = new Map(); // In production, use Redis
    
    return async (request, reply) => {
      if (!request.isScriptRequest) {
        return;
      }

      const userId = request.user?.sub;
      const complexity = request.parsedScript?.meta.complexity || 1;
      
      if (!userId) return;
      
      const key = `script_rate_limit:${userId}`;
      const window = 60 * 1000; // 1 minute window
      const now = Date.now();
      
      // Get current counts
      let userCounts = scriptCounts.get(key) || { count: 0, complexitySum: 0, windowStart: now };
      
      // Reset if window expired
      if (now - userCounts.windowStart > window) {
        userCounts = { count: 0, complexitySum: 0, windowStart: now };
      }
      
      // Define limits based on user role
      const limits = {
        admin: { maxScripts: 100, maxComplexity: 200 },
        dev: { maxScripts: 50, maxComplexity: 100 },
        analyst: { maxScripts: 30, maxComplexity: 60 },
        user: { maxScripts: 10, maxComplexity: 20 }
      };
      
      const userLimits = limits[request.user.role] || limits.user;
      
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
      scriptCounts.set(key, userCounts);
      
      // Clean up old entries periodically
      if (Math.random() < 0.1) {
        this.cleanupRateLimitCache(scriptCounts, window);
      }
    };
  }

  // Clean up expired rate limit entries
  cleanupRateLimitCache(cache, window) {
    const now = Date.now();
    for (const [key, data] of cache.entries()) {
      if (now - data.windowStart > window * 2) {
        cache.delete(key);
      }
    }
  }

  // Create script analysis middleware
  analyzeScript() {
    return async (request, reply) => {
      if (!request.isScriptRequest) {
        return;
      }

      const parsed = request.parsedScript;
      const analysis = {
        readOperations: 0,
        writeOperations: 0,
        aggregationStages: 0,
        indexHints: 0,
        crossCollectionRefs: parsed.meta.collections.length > 1
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
        analysis.aggregationStages = parsed.params.pipeline.length;
      }

      // Store analysis in request context
      request.scriptAnalysis = analysis;
      
      request.log.debug('Script analysis completed', analysis);
    };
  }

  // Get parser instance for external use
  getParser() {
    return this.parser;
  }
}

module.exports = ScriptParsingMiddleware;
