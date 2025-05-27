import fs from 'fs/promises';
import path from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

class SchemaLoader {
  constructor() {
    this.schemas = new Map();
    this.functions = new Map();
    this.validator = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false,
      coerceTypes: true
    });

    // Add format validation (email, date-time, etc.)
    addFormats(this.validator);

    // Custom keywords for MongoDB ObjectId
    this.validator.addKeyword({
      keyword: 'objectId',
      type: 'string',
      schemaType: 'boolean',
      compile: () => (data) => /^[0-9a-fA-F]{24}$/.test(data)
    });

    this.schemasPath = path.join(process.cwd(), 'schemas');
    this.collectionsPath = path.join(this.schemasPath, 'collections');
    this.functionsPath = path.join(this.schemasPath, 'functions');
  }

  async loadSchemas() {
    try {
      console.log('Loading schemas...');

      // Load collection schemas
      await this.loadCollectionSchemas();

      // Load function schemas
      await this.loadFunctionSchemas();

      console.log(`✅ Loaded ${this.schemas.size} collection schemas`);
      console.log(`✅ Loaded ${this.functions.size} function definitions`);

      // Validate all schemas
      this.validateLoadedSchemas();

      return {
        collections: this.schemas.size,
        functions: this.functions.size
      };
    } catch (error) {
      console.error('❌ Failed to load schemas:', error);
      throw error;
    }
  }

  async loadCollectionSchemas() {
    try {
      const files = await this.getJsonFiles(this.collectionsPath);

      for (const file of files) {
        const filePath = path.join(this.collectionsPath, file);
        const schema = await this.loadJsonFile(filePath);

        // Validate schema structure
        this.validateCollectionSchema(schema, file);

        // Add to schemas map
        const collectionName = schema.collection || path.basename(file, '.json');
        this.schemas.set(collectionName, schema);

        // Add schema to AJV validator
        this.validator.addSchema(schema, collectionName);

        console.log(`  📄 Loaded collection schema: ${collectionName}`);
      }
    } catch (error) {
      throw new Error(`Failed to load collection schemas: ${error.message}`);
    }
  }

  async loadFunctionSchemas() {
    try {
      await this.loadFunctionSchemasRecursively(this.functionsPath);
    } catch (error) {
      throw new Error(`Failed to load function schemas: ${error.message}`);
    }
  }

  async loadFunctionSchemasRecursively(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Recursively load from subdirectories
          await this.loadFunctionSchemasRecursively(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          const functionDef = await this.loadJsonFile(fullPath);

          // Validate function structure
          this.validateFunctionSchema(functionDef, entry.name);

          // Add to functions map
          const functionName = functionDef.name || path.basename(entry.name, '.json');
          this.functions.set(functionName, functionDef);

          console.log(`  🔧 Loaded function: ${functionName}`);
        }
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`  ⚠️  Functions directory not found: ${dir}`);
        return;
      }
      throw error;
    }
  }

  async getJsonFiles(directory) {
    try {
      const files = await fs.readdir(directory);
      return files.filter(file => file.endsWith('.json'));
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`  ⚠️  Directory not found: ${directory}`);
        return [];
      }
      throw error;
    }
  }

  async loadJsonFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load ${filePath}: ${error.message}`);
    }
  }

  validateCollectionSchema(schema, filename) {
    const requiredFields = ['title', 'type', 'properties'];
    const missingFields = requiredFields.filter(field => !schema[field]);

    if (missingFields.length > 0) {
      throw new Error(`Schema ${filename} missing required fields: ${missingFields.join(', ')}`);
    }

    if (schema.type !== 'object') {
      throw new Error(`Schema ${filename} must have type 'object'`);
    }

    // Validate MongoDB-specific fields
    if (schema.mongorest) {
      this.validateMongoRestConfig(schema.mongorest, filename);
    }

    // Validate indexes format
    if (schema.indexes) {
      this.validateIndexes(schema.indexes, filename);
    }

    // Validate relationships
    if (schema.relationships) {
      this.validateRelationships(schema.relationships, filename);
    }
  }

  validateFunctionSchema(functionDef, filename) {
    const requiredFields = ['name', 'description', 'method', 'steps'];
    const missingFields = requiredFields.filter(field => !functionDef[field]);

    if (missingFields.length > 0) {
      throw new Error(`Function ${filename} missing required fields: ${missingFields.join(', ')}`);
    }

    // Validate HTTP method
    const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    if (!validMethods.includes(functionDef.method.toUpperCase())) {
      throw new Error(`Function ${filename} has invalid HTTP method: ${functionDef.method}`);
    }

    // Validate steps
    if (!Array.isArray(functionDef.steps) || functionDef.steps.length === 0) {
      throw new Error(`Function ${filename} must have at least one step`);
    }

    // Validate each step
    functionDef.steps.forEach((step, index) => {
      this.validateFunctionStep(step, index, filename);
    });
  }

  validateFunctionStep(step, index, filename) {
    if (!step.id || !step.type) {
      throw new Error(`Function ${filename} step ${index} missing required fields: id, type`);
    }

    const validStepTypes = [
      'find', 'findOne', 'insertOne', 'insertMany',
      'updateOne', 'updateMany', 'deleteOne', 'deleteMany',
      'aggregate', 'countDocuments', 'distinct',
      'transform', 'http', 'condition'
    ];

    if (!validStepTypes.includes(step.type)) {
      throw new Error(`Function ${filename} step ${index} has invalid type: ${step.type}`);
    }

    // Validate MongoDB operations require collection
    const mongoOperations = [
      'find', 'findOne', 'insertOne', 'insertMany',
      'updateOne', 'updateMany', 'deleteOne', 'deleteMany',
      'aggregate', 'countDocuments', 'distinct'
    ];

    if (mongoOperations.includes(step.type) && !step.collection) {
      throw new Error(`Function ${filename} step ${index} of type '${step.type}' requires 'collection' field`);
    }
  }

  validateMongoRestConfig(config, filename) {
    // Validate permissions
    if (config.permissions) {
      const validOperations = ['read', 'create', 'update', 'delete'];
      for (const [operation, roles] of Object.entries(config.permissions)) {
        if (!validOperations.includes(operation)) {
          throw new Error(`Schema ${filename} has invalid permission operation: ${operation}`);
        }
        if (!Array.isArray(roles)) {
          throw new Error(`Schema ${filename} permission '${operation}' must be an array of roles`);
        }
      }
    }

    // Validate rate limits
    if (config.rateLimits) {
      for (const [operation, limit] of Object.entries(config.rateLimits)) {
        if (!limit.requests || !limit.window) {
          throw new Error(`Schema ${filename} rate limit for '${operation}' must have 'requests' and 'window'`);
        }
      }
    }
  }

  validateIndexes(indexes, filename) {
    if (!Array.isArray(indexes)) {
      throw new Error(`Schema ${filename} indexes must be an array`);
    }

    indexes.forEach((index, i) => {
      if (!index.fields || typeof index.fields !== 'object') {
        throw new Error(`Schema ${filename} index ${i} must have 'fields' object`);
      }
    });
  }

  validateRelationships(relationships, filename) {
    if (typeof relationships !== 'object') {
      throw new Error(`Schema ${filename} relationships must be an object`);
    }

    for (const [relationName, relationship] of Object.entries(relationships)) {
      this.validateRelationship(relationship, relationName, filename);
    }
  }

  validateRelationship(relationship, relationName, filename) {
    const requiredFields = ['type', 'collection', 'localField', 'foreignField'];
    const missingFields = requiredFields.filter(field => !relationship[field]);

    if (missingFields.length > 0) {
      throw new Error(`Schema ${filename} relationship '${relationName}' missing required fields: ${missingFields.join(', ')}`);
    }

    // Validate relationship type
    const validTypes = ['belongsTo', 'hasMany', 'manyToMany'];
    if (!validTypes.includes(relationship.type)) {
      throw new Error(`Schema ${filename} relationship '${relationName}' has invalid type: ${relationship.type}`);
    }

    // Validate many-to-many specific fields
    if (relationship.type === 'manyToMany') {
      const requiredM2MFields = ['through', 'throughLocalField', 'throughForeignField'];
      const missingM2MFields = requiredM2MFields.filter(field => !relationship[field]);

      if (missingM2MFields.length > 0) {
        throw new Error(`Schema ${filename} manyToMany relationship '${relationName}' missing required fields: ${missingM2MFields.join(', ')}`);
      }
    }

    // Validate pagination settings for hasMany relationships
    if (relationship.type === 'hasMany' && relationship.pagination) {
      const pagination = relationship.pagination;
      if (pagination.maxLimit && pagination.defaultLimit && pagination.defaultLimit > pagination.maxLimit) {
        throw new Error(`Schema ${filename} relationship '${relationName}' defaultLimit cannot exceed maxLimit`);
      }
    }

    // Validate default sort format
    if (relationship.defaultSort && typeof relationship.defaultSort !== 'object') {
      throw new Error(`Schema ${filename} relationship '${relationName}' defaultSort must be an object`);
    }
  }

  validateLoadedSchemas() {
    console.log('Validating loaded schemas...');

    let validSchemas = 0;
    let validFunctions = 0;

    // Validate collection schemas against JSON Schema spec
    for (const [name, schema] of this.schemas) {
      try {
        this.validator.compile(schema);
        validSchemas++;
      } catch (error) {
        throw new Error(`Invalid schema '${name}': ${error.message}`);
      }
    }

    // Validate function input/output schemas
    for (const [name, functionDef] of this.functions) {
      try {
        if (functionDef.input) {
          this.validator.compile(functionDef.input);
        }
        if (functionDef.output) {
          this.validator.compile(functionDef.output);
        }
        validFunctions++;
      } catch (error) {
        throw new Error(`Invalid function '${name}': ${error.message}`);
      }
    }

    console.log(`✅ Validated ${validSchemas} collection schemas`);
    console.log(`✅ Validated ${validFunctions} function definitions`);
  }

  // Public methods for runtime access
  getSchema(collectionName) {
    return this.schemas.get(collectionName);
  }

  getFunction(functionName) {
    return this.functions.get(functionName);
  }

  getAllSchemas() {
    return Array.from(this.schemas.entries()).map(([name, schema]) => ({
      name,
      title: schema.title,
      description: schema.description,
      collection: schema.collection || name
    }));
  }

  getAllFunctions() {
    return Array.from(this.functions.entries()).map(([name, func]) => ({
      name,
      description: func.description,
      method: func.method,
      endpoint: func.endpoint,
      category: func.category
    }));
  }

  getCollectionNames() {
    return Array.from(this.schemas.keys());
  }

  getCollectionSchema(collectionName) {
    return this.schemas.get(collectionName);
  }

  validateDocument(collectionName, document) {
    const schema = this.getSchema(collectionName);
    if (!schema) {
      throw new Error(`Schema not found for collection: ${collectionName}`);
    }

    const validate = this.validator.getSchema(collectionName);
    if (!validate) {
      throw new Error(`Validator not found for collection: ${collectionName}`);
    }

    const valid = validate(document);
    if (!valid) {
      return {
        valid: false,
        errors: validate.errors
      };
    }

    return { valid: true };
  }

  validateFunctionInput(functionName, input) {
    const functionDef = this.getFunction(functionName);
    if (!functionDef) {
      throw new Error(`Function not found: ${functionName}`);
    }

    if (!functionDef.input) {
      return { valid: true }; // No input validation required
    }

    const validate = this.validator.compile(functionDef.input);
    const valid = validate(input);

    if (!valid) {
      return {
        valid: false,
        errors: validate.errors
      };
    }

    return { valid: true };
  }

  // Hot reload functionality for development
  async reloadSchemas() {
    console.log('Reloading schemas...');

    // Clear existing schemas
    this.schemas.clear();
    this.functions.clear();

    // Reload all schemas
    return await this.loadSchemas();
  }
}

export default SchemaLoader;
