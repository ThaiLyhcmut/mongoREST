// Validation Middleware - Schema and method validation for API requests
import { FastifyRequest, FastifyReply } from 'fastify';

interface MethodConfig {
  mappings?: { [method: string]: { allowedOperations: string[] } };
  specialCases?: { [key: string]: any };
  operationInference?: { [key: string]: any };
  strict?: boolean;
  validation?: {
    enabled: boolean;
    logViolations: boolean;
    rejectOnViolation: boolean;
  };
}

interface ValidationError {
  error: string;
  message: string;
  method?: string;
  operation?: string;
  allowed?: string[];
  suggestion?: string;
}

interface SchemaValidationOptions {
  strict?: boolean;
  coerceTypes?: boolean;
  removeAdditional?: boolean;
}

// Extend FastifyRequest to include our custom properties
declare module 'fastify' {
  interface FastifyRequest {
    mongoOperation?: string;
    isValidOperation?: boolean;
    validationContext?: {
      collection: string;
      schema: any;
      operation: string;
    };
  }
}

class ValidationManager {
  private config: MethodConfig;
  private mappings: { [method: string]: { allowedOperations: string[] } };
  private specialCases: { [key: string]: any };
  private operationInference: { [key: string]: any };
  private strict: boolean;

  constructor(methodConfig: MethodConfig) {
    this.config = methodConfig;
    this.mappings = methodConfig.mappings || {};
    this.specialCases = methodConfig.specialCases || {};
    this.operationInference = methodConfig.operationInference || {};
    this.strict = methodConfig.strict !== false; // Default to strict mode
  }

  // Middleware to validate method-operation mapping
  validateMethodOperation() {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!this.config.validation?.enabled) {
        return; // Skip validation if disabled
      }

      try {
        const method = request.method;
        const operation = this.inferOperation(request);
        
        if (!this.isOperationAllowed(method, operation)) {
          const error: ValidationError = {
            error: 'Method-Operation Mismatch',
            message: `Operation '${operation}' not allowed for ${method} method`,
            method,
            operation,
            allowed: this.mappings[method]?.allowedOperations || [],
            suggestion: this.suggestCorrectMethod(operation)
          };

          // Log violation if enabled
          if (this.config.validation?.logViolations) {
            this.logViolation(request, error);
          }

          // Reject if strict mode is enabled
          if (this.config.validation?.rejectOnViolation) {
            return reply.code(400).send(error);
          }
        }

        // Add operation info to request context
        request.mongoOperation = operation;
        request.isValidOperation = true;

      } catch (error: any) {
        reply.code(400).send({
          error: 'Operation validation failed',
          message: error.message
        });
      }
    };
  }

  // Middleware for schema validation
  validateSchema(collection: string, options: SchemaValidationOptions = {}) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        const schema = (request.server as any).schemaLoader.getSchema(collection);
        
        if (!schema) {
          return reply.code(404).send({
            error: 'Schema not found',
            message: `Schema for collection '${collection}' not found`
          });
        }

        // Set validation context
        request.validationContext = {
          collection,
          schema,
          operation: request.mongoOperation || 'unknown'
        };

        // Validate request body against schema
        if (request.body && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
          const validationResult = await this.validateDocument(request.body, schema, options);
          
          if (!validationResult.isValid) {
            return reply.code(400).send({
              error: 'Schema validation failed',
              message: 'Request body does not match schema requirements',
              details: validationResult.errors,
              schema: collection
            });
          }

          // Apply transformations if needed
          if (validationResult.transformedData) {
            request.body = validationResult.transformedData;
          }
        }

        // Validate query parameters for GET requests
        if (request.method === 'GET' && request.query) {
          const queryValidation = await this.validateQueryParams(request.query, schema);
          
          if (!queryValidation.isValid) {
            return reply.code(400).send({
              error: 'Query validation failed',
              message: 'Query parameters are invalid',
              details: queryValidation.errors
            });
          }
        }

      } catch (error: any) {
        reply.code(500).send({
          error: 'Schema validation error',
          message: error.message
        });
      }
    };
  }

  // Validate a single document against schema
  async validateDocument(document: any, schema: any, options: SchemaValidationOptions = {}): Promise<{
    isValid: boolean;
    errors: string[];
    transformedData?: any;
  }> {
    const errors: string[] = [];
    let transformedData = { ...document };

    try {
      // Check required fields
      if (schema.required) {
        for (const field of schema.required) {
          if (!(field in document) || document[field] === null || document[field] === undefined) {
            errors.push(`Required field '${field}' is missing`);
          }
        }
      }

      // Validate properties
      if (schema.properties) {
        for (const [key, value] of Object.entries(document)) {
          const propertySchema = schema.properties[key];
          
          if (!propertySchema) {
            if (schema.additionalProperties === false) {
              if (options.removeAdditional) {
                delete transformedData[key];
              } else if (options.strict !== false) {
                errors.push(`Additional property '${key}' is not allowed`);
              }
            }
            continue;
          }

          const fieldValidation = await this.validateField(key, value, propertySchema as any, options);
          if (!fieldValidation.isValid) {
            errors.push(...fieldValidation.errors);
          } else if (fieldValidation.transformedValue !== undefined) {
            transformedData[key] = fieldValidation.transformedValue;
          }
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        transformedData: errors.length === 0 ? transformedData : undefined
      };

    } catch (error: any) {
      return {
        isValid: false,
        errors: [`Validation error: ${error.message}`]
      };
    }
  }

  // Validate individual field
  private async validateField(fieldName: string, value: any, propertySchema: any, options: SchemaValidationOptions): Promise<{
    isValid: boolean;
    errors: string[];
    transformedValue?: any;
  }> {
    const errors: string[] = [];
    let transformedValue = value;

    // Type validation
    const expectedType = propertySchema.type;
    const actualType = this.getValueType(value);

    if (expectedType && actualType !== expectedType) {
      if (options.coerceTypes) {
        const coercedValue = this.coerceType(value, expectedType);
        if (coercedValue !== null) {
          transformedValue = coercedValue;
        } else {
          errors.push(`Field '${fieldName}' should be of type ${expectedType}, got ${actualType}`);
        }
      } else {
        errors.push(`Field '${fieldName}' should be of type ${expectedType}, got ${actualType}`);
      }
    }

    // Format validation
    if (propertySchema.format && typeof transformedValue === 'string') {
      if (!this.validateFormat(transformedValue, propertySchema.format)) {
        errors.push(`Field '${fieldName}' does not match format '${propertySchema.format}'`);
      }
    }

    // Enum validation
    if (propertySchema.enum && !propertySchema.enum.includes(transformedValue)) {
      errors.push(`Field '${fieldName}' must be one of: ${propertySchema.enum.join(', ')}`);
    }

    // String length validation
    if (typeof transformedValue === 'string') {
      if (propertySchema.minLength && transformedValue.length < propertySchema.minLength) {
        errors.push(`Field '${fieldName}' must be at least ${propertySchema.minLength} characters long`);
      }
      if (propertySchema.maxLength && transformedValue.length > propertySchema.maxLength) {
        errors.push(`Field '${fieldName}' must be at most ${propertySchema.maxLength} characters long`);
      }
      if (propertySchema.pattern && !new RegExp(propertySchema.pattern).test(transformedValue)) {
        errors.push(`Field '${fieldName}' does not match the required pattern`);
      }
    }

    // Number validation
    if (typeof transformedValue === 'number') {
      if (propertySchema.minimum && transformedValue < propertySchema.minimum) {
        errors.push(`Field '${fieldName}' must be at least ${propertySchema.minimum}`);
      }
      if (propertySchema.maximum && transformedValue > propertySchema.maximum) {
        errors.push(`Field '${fieldName}' must be at most ${propertySchema.maximum}`);
      }
    }

    // Array validation
    if (Array.isArray(transformedValue)) {
      if (propertySchema.minItems && transformedValue.length < propertySchema.minItems) {
        errors.push(`Field '${fieldName}' must have at least ${propertySchema.minItems} items`);
      }
      if (propertySchema.maxItems && transformedValue.length > propertySchema.maxItems) {
        errors.push(`Field '${fieldName}' must have at most ${propertySchema.maxItems} items`);
      }

      // Validate array items
      if (propertySchema.items) {
        for (let i = 0; i < transformedValue.length; i++) {
          const itemValidation = await this.validateField(`${fieldName}[${i}]`, transformedValue[i], propertySchema.items, options);
          if (!itemValidation.isValid) {
            errors.push(...itemValidation.errors);
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      transformedValue: transformedValue !== value ? transformedValue : undefined
    };
  }

  // Validate query parameters
  private async validateQueryParams(query: any, schema: any): Promise<{
    isValid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    // Check for valid query field names
    if (schema.properties) {
      for (const key of Object.keys(query)) {
        // Skip special query parameters
        if (['_limit', '_offset', '_sort', '_select', '_expand'].includes(key)) {
          continue;
        }

        if (!schema.properties[key]) {
          errors.push(`Query parameter '${key}' is not a valid field`);
        }
      }
    }

    // Validate special parameters
    if (query._limit && (!Number.isInteger(Number(query._limit)) || Number(query._limit) < 1)) {
      errors.push('_limit must be a positive integer');
    }

    if (query._offset && (!Number.isInteger(Number(query._offset)) || Number(query._offset) < 0)) {
      errors.push('_offset must be a non-negative integer');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Infer operation from request
  private inferOperation(request: FastifyRequest): string {
    const method = request.method;
    const path = request.routerPath || request.url;
    
    // Check for explicit operation in query or headers
    if ((request.query as any)?._operation) {
      return (request.query as any)._operation;
    }

    if (request.headers['x-operation']) {
      return request.headers['x-operation'] as string;
    }

    // Infer from method and path
    if (method === 'GET') {
      return path.includes('/:id') ? 'findOne' : 'find';
    }
    
    if (method === 'POST') {
      return 'insertOne';
    }
    
    if (method === 'PUT') {
      return 'replaceOne';
    }
    
    if (method === 'PATCH') {
      return 'updateOne';
    }
    
    if (method === 'DELETE') {
      return 'deleteOne';
    }

    return 'unknown';
  }

  // Check if operation is allowed for method
  private isOperationAllowed(method: string, operation: string): boolean {
    const methodConfig = this.mappings[method];
    if (!methodConfig) return true; // Allow if no config
    
    return methodConfig.allowedOperations.includes(operation);
  }

  // Suggest correct method for operation
  private suggestCorrectMethod(operation: string): string {
    const operationMethods: { [op: string]: string[] } = {
      find: ['GET'],
      findOne: ['GET'],
      insertOne: ['POST'],
      insertMany: ['POST'],
      updateOne: ['PATCH', 'PUT'],
      updateMany: ['PATCH'],
      replaceOne: ['PUT'],
      deleteOne: ['DELETE'],
      deleteMany: ['DELETE']
    };

    return operationMethods[operation]?.[0] || 'GET';
  }

  // Log validation violations
  private logViolation(request: FastifyRequest, error: ValidationError): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      method: request.method,
      url: request.url,
      violation: error
    };

    console.log('Validation Violation:', JSON.stringify(logEntry, null, 2));
  }

  // Get JavaScript type of value
  private getValueType(value: any): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (value instanceof Date) return 'string'; // Dates are typically serialized as strings
    return typeof value;
  }

  // Coerce value to target type
  private coerceType(value: any, targetType: string): any {
    switch (targetType) {
      case 'string':
        return String(value);
      case 'number':
        const num = Number(value);
        return isNaN(num) ? null : num;
      case 'integer':
        const int = parseInt(String(value), 10);
        return isNaN(int) ? null : int;
      case 'boolean':
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
          const lower = value.toLowerCase();
          if (lower === 'true' || lower === '1') return true;
          if (lower === 'false' || lower === '0') return false;
        }
        return null;
      default:
        return null;
    }
  }

  // Validate string format
  private validateFormat(value: string, format: string): boolean {
    switch (format) {
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      case 'date':
        return !isNaN(Date.parse(value));
      case 'date-time':
        return !isNaN(Date.parse(value));
      case 'uri':
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      case 'uuid':
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
      default:
        return true; // Unknown format, assume valid
    }
  }

  // Validate collection schema structure
  async validateCollectionSchema(collection: string, schema: any): Promise<{
    isValid: boolean;
    errors: string[];
    recommendations: string[];
  }> {
    const errors: string[] = [];
    const recommendations: string[] = [];

    try {
      // Check basic schema structure
      if (!schema.type || schema.type !== 'object') {
        errors.push('Schema must have type "object"');
      }

      if (!schema.properties || typeof schema.properties !== 'object') {
        errors.push('Schema must have properties object');
      }

      // Check for required _id field
      if (schema.properties && !schema.properties._id) {
        recommendations.push('Consider adding _id field definition');
      }

      // Check for timestamps
      if (schema.properties && !schema.properties.createdAt && !schema.properties.updatedAt) {
        recommendations.push('Consider adding timestamp fields (createdAt, updatedAt)');
      }

      // Validate property definitions
      if (schema.properties) {
        for (const [propName, propSchema] of Object.entries(schema.properties)) {
          const prop = propSchema as any;
          
          if (!prop.type) {
            errors.push(`Property '${propName}' missing type definition`);
          }

          if (prop.type === 'string' && !prop.maxLength) {
            recommendations.push(`Consider adding maxLength to string property '${propName}'`);
          }
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        recommendations
      };

    } catch (error: any) {
      return {
        isValid: false,
        errors: [`Schema validation error: ${error.message}`],
        recommendations: []
      };
    }
  }

  // Validate sample documents from collection
  async validateSampleDocuments(collection: string, sampleCount: number = 10): Promise<{
    isValid: boolean;
    documentsChecked: number;
    validDocuments: number;
    invalidDocuments: number;
    errors: string[];
    recommendations: string[];
  }> {
    // This would typically fetch actual documents from the database
    // For now, return mock validation results
    return {
      isValid: true,
      documentsChecked: sampleCount,
      validDocuments: sampleCount - 1,
      invalidDocuments: 1,
      errors: ['Sample document missing required field "name"'],
      recommendations: ['Consider migrating existing documents to match updated schema']
    };
  }
}

export default ValidationManager;
