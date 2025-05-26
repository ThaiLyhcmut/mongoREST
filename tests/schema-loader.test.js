const SchemaLoader = require('../src/core/schema-loader');
const path = require('path');
const fs = require('fs').promises;

describe('SchemaLoader', () => {
  let schemaLoader;
  let tempSchemaDir;

  beforeAll(async () => {
    // Create temporary schema directory for testing
    tempSchemaDir = path.join(__dirname, 'temp-schemas');
    await fs.mkdir(tempSchemaDir, { recursive: true });
    await fs.mkdir(path.join(tempSchemaDir, 'collections'), { recursive: true });
    await fs.mkdir(path.join(tempSchemaDir, 'functions'), { recursive: true });
  });

  beforeEach(() => {
    schemaLoader = new SchemaLoader();
    // Override paths for testing
    schemaLoader.schemasPath = tempSchemaDir;
    schemaLoader.collectionsPath = path.join(tempSchemaDir, 'collections');
    schemaLoader.functionsPath = path.join(tempSchemaDir, 'functions');
  });

  afterAll(async () => {
    // Clean up temporary directory
    await fs.rmdir(tempSchemaDir, { recursive: true });
  });

  describe('loadSchemas', () => {
    test('should load valid collection schemas', async () => {
      // Create a test schema
      const testSchema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        title: 'Test Collection',
        type: 'object',
        collection: 'test',
        properties: {
          _id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' }
        },
        required: ['name', 'email']
      };

      await fs.writeFile(
        path.join(tempSchemaDir, 'collections', 'test.json'),
        JSON.stringify(testSchema, null, 2)
      );

      const result = await schemaLoader.loadSchemas();

      expect(result.collections).toBe(1);
      expect(schemaLoader.getSchema('test')).toEqual(testSchema);
    });

    test('should load valid function schemas', async () => {
      const testFunction = {
        name: 'testFunction',
        description: 'Test function',
        method: 'POST',
        steps: [{
          id: 'step1',
          type: 'find',
          collection: 'test'
        }]
      };

      await fs.writeFile(
        path.join(tempSchemaDir, 'functions', 'test-function.json'),
        JSON.stringify(testFunction, null, 2)
      );

      const result = await schemaLoader.loadSchemas();

      expect(result.functions).toBe(1);
      expect(schemaLoader.getFunction('testFunction')).toEqual(testFunction);
    });

    test('should reject invalid schemas', async () => {
      const invalidSchema = {
        title: 'Invalid Schema',
        // Missing required fields: type, properties
        collection: 'invalid'
      };

      await fs.writeFile(
        path.join(tempSchemaDir, 'collections', 'invalid.json'),
        JSON.stringify(invalidSchema, null, 2)
      );

      await expect(schemaLoader.loadSchemas()).rejects.toThrow();
    });
  });

  describe('validateDocument', () => {
    beforeEach(async () => {
      const testSchema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        title: 'User Schema',
        type: 'object',
        collection: 'users',
        properties: {
          _id: { type: 'string' },
          name: { type: 'string', minLength: 2 },
          email: { type: 'string', format: 'email' },
          age: { type: 'integer', minimum: 0 }
        },
        required: ['name', 'email']
      };

      await fs.writeFile(
        path.join(tempSchemaDir, 'collections', 'users.json'),
        JSON.stringify(testSchema, null, 2)
      );

      await schemaLoader.loadSchemas();
    });

    test('should validate valid document', () => {
      const validDoc = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      };

      const result = schemaLoader.validateDocument('users', validDoc);
      expect(result.valid).toBe(true);
    });

    test('should reject document with missing required fields', () => {
      const invalidDoc = {
        name: 'John Doe'
        // Missing required email field
      };

      const result = schemaLoader.validateDocument('users', invalidDoc);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    test('should reject document with invalid field types', () => {
      const invalidDoc = {
        name: 'John Doe',
        email: 'invalid-email',
        age: -5
      };

      const result = schemaLoader.validateDocument('users', invalidDoc);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('validateFunctionInput', () => {
    beforeEach(async () => {
      const testFunction = {
        name: 'testFunction',
        description: 'Test function',
        method: 'POST',
        input: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            count: { type: 'integer', minimum: 1 }
          },
          required: ['name']
        },
        steps: [{
          id: 'step1',
          type: 'find',
          collection: 'test'
        }]
      };

      await fs.writeFile(
        path.join(tempSchemaDir, 'functions', 'test-function.json'),
        JSON.stringify(testFunction, null, 2)
      );

      await schemaLoader.loadSchemas();
    });

    test('should validate valid function input', () => {
      const validInput = {
        name: 'test',
        count: 5
      };

      const result = schemaLoader.validateFunctionInput('testFunction', validInput);
      expect(result.valid).toBe(true);
    });

    test('should reject invalid function input', () => {
      const invalidInput = {
        count: -1
        // Missing required name field
      };

      const result = schemaLoader.validateFunctionInput('testFunction', invalidInput);
      expect(result.valid).toBe(false);
    });
  });

  describe('getAllSchemas', () => {
    test('should return all loaded schemas', async () => {
      const testSchema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        title: 'Test Schema',
        description: 'A test schema',
        type: 'object',
        collection: 'test',
        properties: {
          name: { type: 'string' }
        },
        required: ['name']
      };

      await fs.writeFile(
        path.join(tempSchemaDir, 'collections', 'test.json'),
        JSON.stringify(testSchema, null, 2)
      );

      await schemaLoader.loadSchemas();
      const schemas = schemaLoader.getAllSchemas();

      expect(schemas).toHaveLength(1);
      expect(schemas[0]).toEqual({
        name: 'test',
        title: 'Test Schema',
        description: 'A test schema',
        collection: 'test'
      });
    });
  });

  describe('getAllFunctions', () => {
    test('should return all loaded functions', async () => {
      const testFunction = {
        name: 'testFunction',
        description: 'A test function',
        method: 'POST',
        category: 'test',
        endpoint: '/test',
        steps: [{
          id: 'step1',
          type: 'find',
          collection: 'test'
        }]
      };

      await fs.writeFile(
        path.join(tempSchemaDir, 'functions', 'test-function.json'),
        JSON.stringify(testFunction, null, 2)
      );

      await schemaLoader.loadSchemas();
      const functions = schemaLoader.getAllFunctions();

      expect(functions).toHaveLength(1);
      expect(functions[0]).toEqual({
        name: 'testFunction',
        description: 'A test function',
        method: 'POST',
        endpoint: '/test',
        category: 'test'
      });
    });
  });
});
