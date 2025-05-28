class ValidationManager {
  constructor(methodConfig) {
    this.config = methodConfig;
    this.mappings = methodConfig.mappings || {};
    this.specialCases = methodConfig.specialCases || {};
    this.operationInference = methodConfig.operationInference || {};
    this.strict = methodConfig.strict !== false; // Default to strict mode
  }

  // Middleware to validate method-operation mapping
  validateMethodOperation() {
    return async (request, reply) => {
      if (!this.config.validation.enabled) {
        return; // Skip validation if disabled
      }

      try {
        const method = request.method;
        const operation = this.inferOperation(request);
        
        if (!this.isOperationAllowed(method, operation)) {
          const error = {
            error: 'Method-Operation Mismatch',
            message: `Operation '${operation}' not allowed for ${method} method`,
            method,
            operation,
            allowed: this.mappings[method]?.allowedOperations || [],
            suggestion: this.suggestCorrectMethod(operation)
          };

          // Log violation if enabled
          if (this.config.validation.logViolations) {
            this.logViolation(request, error);
          }

          // Reject if strict mode is enabled
          if (this.config.validation.rejectOnViolation) {
            return reply.code(400).send(error);
          }
        }

        // Add operation info to request context
        request.mongoOperation = operation;
        request.isValidOperation = true;

      } catch (error) {
        reply.code(400).send({
          error: 'Operation validation failed',
          message: error.message
        });
      }
    };
  }

  // Infer MongoDB operation from request
  inferOperation(request) {
    const method = request.method;
    const url = request.url;
    const body = request.body || {};

    // Check if operation is explicitly specified in body
    if (body.operation) {
      return body.operation;
    }

    // Infer from URL pattern
    const routePattern = this.getRoutePattern(request);
    if (this.operationInference[routePattern]) {
      return this.operationInference[routePattern];
    }

    // Infer from method and URL structure
    return this.inferFromMethodAndUrl(method, url, request.params);
  }

  // Get route pattern for operation inference
  getRoutePattern(request) {
    const method = request.method;
    const routeConfig = request.routeConfig || {};
    const url = routeConfig.url || request.url;

    // Convert dynamic segments to patterns
    const pattern = url
      .replace(/\/:[^\/]+/g, '/:param')
      .replace(/\/\*/g, '/*');

    return `${method} ${pattern}`;
  }

  // Infer operation from HTTP method and URL structure
  inferFromMethodAndUrl(method, url, params = {}) {
    const hasId = params.id || url.match(/\/[a-fA-F0-9]{24}$/);

    switch (method) {
      case 'GET':
        if (url.includes('/functions/')) {
          return 'function_call'; // Special case for GET function calls
        }
        return hasId ? 'findOne' : 'find';

      case 'POST':
        if (url.includes('/functions/')) {
          return 'function_call';
        }
        return 'insertOne'; // Default for POST to collections

      case 'PUT':
        return hasId ? 'replaceOne' : 'insertMany';

      case 'PATCH':
        return hasId ? 'updateOne' : 'updateMany';

      case 'DELETE':
        return hasId ? 'deleteOne' : 'deleteMany';

      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }
  }

  // Check if operation is allowed for HTTP method
  isOperationAllowed(method, operation) {
    if (!this.strict) {
      return true; // Allow everything in non-strict mode
    }

    const allowedOps = this.mappings[method]?.allowedOperations || [];
    
    // Check direct mapping
    if (allowedOps.includes(operation)) {
      return true;
    }

    // Check special cases
    if (this.specialCases[operation]) {
      const specialCase = this.specialCases[operation];
      if (typeof specialCase === 'object' && specialCase[method]) {
        return true;
      }
    }

    return false;
  }

  // Suggest correct HTTP method for operation
  suggestCorrectMethod(operation) {
    for (const [method, config] of Object.entries(this.mappings)) {
      if (config.allowedOperations.includes(operation)) {
        return {
          method,
          description: config.description
        };
      }
    }

    // Check special cases
    if (this.specialCases[operation]) {
      const specialCase = this.specialCases[operation];
      if (typeof specialCase === 'object') {
        const methods = Object.keys(specialCase);
        return {
          methods,
          note: 'Multiple methods supported for this operation'
        };
      }
    }

    return null;
  }

  // Validate aggregation pipeline for write operations
  validateAggregationPipeline(pipeline) {
    if (!Array.isArray(pipeline)) {
      throw new Error('Aggregation pipeline must be an array');
    }

    const writeStages = ['$out', '$merge'];
    const hasWriteStages = pipeline.some(stage => 
      writeStages.some(writeStage => stage[writeStage])
    );

    return {
      hasWriteStages,
      isReadOnly: !hasWriteStages
    };
  }

  // Special validation for aggregation operations
  validateAggregationMethod(method, pipeline) {
    const pipelineInfo = this.validateAggregationPipeline(pipeline);
    
    if (method === 'GET' && pipelineInfo.hasWriteStages) {
      throw new Error('GET method cannot be used with aggregation pipelines that contain write stages ($out, $merge)');
    }

    if (method === 'POST' && pipelineInfo.isReadOnly) {
      // This is allowed but could suggest GET for better caching
      return {
        warning: 'Consider using GET method for read-only aggregations for better caching'
      };
    }

    return { valid: true };
  }

  // Validate request body structure
  validateRequestBody(request) {
    const method = request.method;
    const body = request.body || {};

    // Methods that shouldn't have body
    const noBodyMethods = ['GET', 'DELETE'];
    if (noBodyMethods.includes(method) && Object.keys(body).length > 0) {
      throw new Error(`${method} requests should not have a request body`);
    }

    // Methods that require body
    const requireBodyMethods = ['POST', 'PUT', 'PATCH'];
    if (requireBodyMethods.includes(method) && Object.keys(body).length === 0) {
      throw new Error(`${method} requests require a request body`);
    }

    return true;
  }

  // Validate query parameters for GET requests
  validateQueryParameters(request) {
    if (request.method !== 'GET') {
      return true;
    }

    const query = request.query || {};
    const allowedParams = [
      'page', 'limit', 'sort', 'order', 'select', 'search', 'searchFields',
      // MongoDB query operators
      'gte', 'gt', 'lte', 'lt', 'ne', 'in', 'nin', 'exists', 'regex'
    ];

    const validationErrors = [];

    // Validate pagination parameters
    if (query.page && (!Number.isInteger(+query.page) || +query.page < 1)) {
      validationErrors.push('page must be a positive integer');
    }

    if (query.limit && (!Number.isInteger(+query.limit) || +query.limit < 1 || +query.limit > 1000)) {
      validationErrors.push('limit must be between 1 and 1000');
    }

    // Validate sort parameter
    if (query.sort && typeof query.sort !== 'string') {
      validationErrors.push('sort must be a string');
    }

    if (query.order && !['asc', 'desc', '1', '-1'].includes(query.order)) {
      validationErrors.push('order must be "asc", "desc", "1", or "-1"');
    }

    if (validationErrors.length > 0) {
      throw new Error(`Query parameter validation failed: ${validationErrors.join(', ')}`);
    }

    return true;
  }

  // Convert query parameters to MongoDB query
  buildMongoQuery(queryParams) {
    const mongoQuery = {};
    const options = {
      sort: {},
      projection: {},
      page: 1,
      limit: 50
    };

    for (const [key, value] of Object.entries(queryParams)) {
      switch (key) {
        case 'page':
          options.page = Math.max(1, parseInt(value));
          break;

        case 'limit':
          options.limit = Math.min(1000, Math.max(1, parseInt(value)));
          break;

        case 'sort':
          const sortOrder = queryParams.order === 'desc' || queryParams.order === '-1' ? -1 : 1;
          options.sort[value] = sortOrder;
          break;

        case 'order':
          // Handled with sort
          break;

        case 'select':
          // Parse field selection: "name,email,profile.country"
          const fields = value.split(',').map(f => f.trim());
          fields.forEach(field => {
            options.projection[field] = 1;
          });
          break;

        case 'search':
          if (queryParams.searchFields) {
            // Text search on specified fields
            const searchFields = queryParams.searchFields.split(',').map(f => f.trim());
            mongoQuery.$or = searchFields.map(field => ({
              [field]: { $regex: value, $options: 'i' }
            }));
          } else {
            // Full text search
            mongoQuery.$text = { $search: value };
          }
          break;

        case 'searchFields':
          // Handled with search
          break;

        default:
          // Handle field queries with operators
          this.parseFieldQuery(key, value, mongoQuery);
          break;
      }
    }

    return { query: mongoQuery, options };
  }

  // Parse field queries with MongoDB operators
  parseFieldQuery(key, value, mongoQuery) {
    // Handle array notation: field[operator]=value
    const arrayMatch = key.match(/^(.+)\[(.+)\]$/);
    
    if (arrayMatch) {
      const [, field, operator] = arrayMatch;
      const mongoOperator = this.getMongoOperator(operator);
      
      if (mongoOperator) {
        if (!mongoQuery[field]) {
          mongoQuery[field] = {};
        }
        mongoQuery[field][mongoOperator] = this.parseValue(value);
      }
    } else {
      // Direct field query
      mongoQuery[key] = this.parseValue(value);
    }
  }

  // Map query operators to MongoDB operators
  getMongoOperator(operator) {
    const operatorMap = {
      'gte': '$gte',
      'gt': '$gt',
      'lte': '$lte',
      'lt': '$lt',
      'ne': '$ne',
      'in': '$in',
      'nin': '$nin',
      'exists': '$exists',
      'regex': '$regex'
    };

    return operatorMap[operator];
  }

  // Parse value with type conversion
  parseValue(value) {
    // Handle arrays (comma-separated)
    if (typeof value === 'string' && value.includes(',')) {
      return value.split(',').map(v => this.parseValue(v.trim()));
    }

    // Handle boolean
    if (value === 'true') return true;
    if (value === 'false') return false;

    // Handle null
    if (value === 'null') return null;

    // Handle numbers
    if (!isNaN(value) && !isNaN(parseFloat(value))) {
      return parseFloat(value);
    }

    // Handle dates (ISO format)
    if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
      return new Date(value);
    }

    return value;
  }

  // Log validation violations
  logViolation(request, error) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'method_operation_violation',
      method: request.method,
      url: request.url,
      operation: error.operation,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      user: request.user?.sub || 'anonymous',
      error: error.message
    };

    console.log('⚠️  Method-Operation Violation:', JSON.stringify(logEntry));
  }

  // Get validation summary
  getValidationSummary() {
    return {
      strict: this.strict,
      enabled: this.config.validation.enabled,
      methods: Object.keys(this.mappings),
      operations: this.getAllowedOperations(),
      specialCases: Object.keys(this.specialCases)
    };
  }

  // Get all allowed operations
  getAllowedOperations() {
    const operations = new Set();
    
    Object.values(this.mappings).forEach(config => {
      config.allowedOperations.forEach(op => operations.add(op));
    });

    Object.keys(this.specialCases).forEach(op => operations.add(op));

    return Array.from(operations);
  }

  // Create validation report
  createValidationReport(request) {
    const method = request.method;
    const operation = this.inferOperation(request);
    const isAllowed = this.isOperationAllowed(method, operation);

    return {
      method,
      operation,
      isAllowed,
      allowedOperations: this.mappings[method]?.allowedOperations || [],
      suggestion: isAllowed ? null : this.suggestCorrectMethod(operation),
      specialCases: this.specialCases[operation] || null
    };
  }
}

export default ValidationManager;
