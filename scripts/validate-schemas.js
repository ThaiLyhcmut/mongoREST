#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

async function validateSchemas() {
  console.log('🔍 Validating MongoREST schemas...\n');

  const validator = new Ajv({
    allErrors: true,
    verbose: true,
    strict: false
  });
  addFormats(validator);

  let totalSchemas = 0;
  let validSchemas = 0;
  let totalFunctions = 0;
  let validFunctions = 0;
  const errors = [];

  // Validate collection schemas
  console.log('📄 Validating Collection Schemas:');
  const collectionsPath = path.join(process.cwd(), 'schemas', 'collections');

  try {
    const collectionFiles = await fs.readdir(collectionsPath);

    for (const file of collectionFiles) {
      if (!file.endsWith('.json')) continue;

      totalSchemas++;
      const filePath = path.join(collectionsPath, file);

      try {
        const content = await fs.readFile(filePath, 'utf8');
        const schema = JSON.parse(content);

        // Validate JSON Schema structure
        validator.compile(schema);

        // Validate MongoREST specific requirements
        validateCollectionSchema(schema, file);

        validSchemas++;
        console.log(`  ✅ ${file} - Valid`);
      } catch (error) {
        errors.push(`Collection ${file}: ${error.message}`);
        console.log(`  ❌ ${file} - ${error.message}`);
      }
    }
  } catch (error) {
    console.log(`  ⚠️  Collections directory not found: ${collectionsPath}`);
  }

  // Validate function schemas
  console.log('\n🔧 Validating Function Schemas:');
  const functionsPath = path.join(process.cwd(), 'schemas', 'functions');

  try {
    await validateFunctionSchemasRecursively(functionsPath, validator, (file, valid, error) => {
      totalFunctions++;
      if (valid) {
        validFunctions++;
        console.log(`  ✅ ${file} - Valid`);
      } else {
        errors.push(`Function ${file}: ${error}`);
        console.log(`  ❌ ${file} - ${error}`);
      }
    });
  } catch (error) {
    console.log(`  ⚠️  Functions directory not found: ${functionsPath}`);
  }

  // Summary
  console.log('\n📊 Validation Summary:');
  console.log(`  Collections: ${validSchemas}/${totalSchemas} valid`);
  console.log(`  Functions: ${validFunctions}/${totalFunctions} valid`);

  if (errors.length > 0) {
    console.log('\n❌ Errors found:');
    errors.forEach(error => console.log(`  - ${error}`));
    process.exit(1);
  } else {
    console.log('\n✅ All schemas are valid!');
    process.exit(0);
  }
}

async function validateFunctionSchemasRecursively(dir, validator, callback) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await validateFunctionSchemasRecursively(fullPath, validator, callback);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        try {
          const content = await fs.readFile(fullPath, 'utf8');
          const functionDef = JSON.parse(content);

          validateFunctionSchema(functionDef, entry.name, validator);
          callback(entry.name, true, null);
        } catch (error) {
          callback(entry.name, false, error.message);
        }
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

function validateCollectionSchema(schema, filename) {
  // Required fields
  const requiredFields = ['title', 'type', 'properties'];
  const missingFields = requiredFields.filter(field => !schema[field]);

  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }

  if (schema.type !== 'object') {
    throw new Error('Schema type must be "object"');
  }

  // Validate properties
  if (!schema.properties || typeof schema.properties !== 'object') {
    throw new Error('Schema must have properties object');
  }

  // Validate MongoREST configuration
  if (schema.mongorest) {
    validateMongoRESTConfig(schema.mongorest, filename);
  }

  // Validate indexes
  if (schema.indexes) {
    validateIndexes(schema.indexes, filename);
  }
}

function validateFunctionSchema(functionDef, filename, validator) {
  // Required fields
  const requiredFields = ['name', 'description', 'steps'];
  const missingFields = requiredFields.filter(field => !functionDef[field]);

  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }

  // Validate HTTP method
  if (functionDef.method) {
    const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    if (!validMethods.includes(functionDef.method.toUpperCase())) {
      throw new Error(`Invalid HTTP method: ${functionDef.method}`);
    }
  }

  // Validate steps
  if (!Array.isArray(functionDef.steps) || functionDef.steps.length === 0) {
    throw new Error('Function must have at least one step');
  }

  // Validate each step
  functionDef.steps.forEach((step, index) => {
    validateFunctionStep(step, index, filename);
  });

  // Validate input/output schemas if present
  if (functionDef.input) {
    validator.compile(functionDef.input);
  }

  if (functionDef.output) {
    validator.compile(functionDef.output);
  }
}

function validateFunctionStep(step, index, filename) {
  if (!step.id || !step.type) {
    throw new Error(`Step ${index} missing required fields: id, type`);
  }

  const validStepTypes = [
    'find', 'findOne', 'insertOne', 'insertMany',
    'updateOne', 'updateMany', 'deleteOne', 'deleteMany',
    'aggregate', 'countDocuments', 'distinct',
    'transform', 'http', 'condition', 'delay'
  ];

  if (!validStepTypes.includes(step.type)) {
    throw new Error(`Step ${index} has invalid type: ${step.type}`);
  }

  // MongoDB operations require collection
  const mongoOperations = [
    'find', 'findOne', 'insertOne', 'insertMany',
    'updateOne', 'updateMany', 'deleteOne', 'deleteMany',
    'aggregate', 'countDocuments', 'distinct'
  ];

  if (mongoOperations.includes(step.type) && !step.collection) {
    throw new Error(`Step ${index} of type '${step.type}' requires 'collection' field`);
  }
}

function validateMongoRESTConfig(config, filename) {
  // Validate permissions
  if (config.permissions) {
    const validOperations = ['read', 'create', 'update', 'delete'];
    for (const [operation, roles] of Object.entries(config.permissions)) {
      if (!validOperations.includes(operation)) {
        throw new Error(`Invalid permission operation: ${operation}`);
      }
      if (!Array.isArray(roles)) {
        throw new Error(`Permission '${operation}' must be an array of roles`);
      }
    }
  }

  // Validate rate limits
  if (config.rateLimits) {
    for (const [operation, limit] of Object.entries(config.rateLimits)) {
      if (!limit.requests || !limit.window) {
        throw new Error(`Rate limit for '${operation}' must have 'requests' and 'window'`);
      }
    }
  }
}

function validateIndexes(indexes, filename) {
  if (!Array.isArray(indexes)) {
    throw new Error('Indexes must be an array');
  }

  indexes.forEach((index, i) => {
    if (!index.fields || typeof index.fields !== 'object') {
      throw new Error(`Index ${i} must have 'fields' object`);
    }
  });
}

// Run validation if called directly
if (require.main === module) {
  validateSchemas().catch(error => {
    console.error('Schema validation failed:', error);
    process.exit(1);
  });
}

module.exports = { validateSchemas };
