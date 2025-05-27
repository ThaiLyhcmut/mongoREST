const { describe, it, expect, beforeAll, afterAll } = require('@jest/globals');
const RelationshipQueryParser = require('../src/core/relationship-parser');
const RelationshipFilterParser = require('../src/core/relationship-filter');
const SchemaLoader = require('../src/core/schema-loader');

describe('Relationship System Tests', () => {
  let schemaLoader;
  let relationshipParser;
  let filterParser;

  beforeAll(async () => {
    // Initialize schema loader with test schemas
    schemaLoader = new SchemaLoader();

    // Mock schemas for testing
    const mockSchemas = new Map();

    // Users schema
    mockSchemas.set('users', {
      title: 'Users',
      collection: 'users',
      properties: {
        _id: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string' }
      },
      relationships: {
        orders: {
          type: 'hasMany',
          collection: 'orders',
          localField: '_id',
          foreignField: 'customerId',
          alias: 'orders'
        }
      }
    });

    // Orders schema
    mockSchemas.set('orders', {
      title: 'Orders',
      collection: 'orders',
      properties: {
        _id: { type: 'string' },
        orderNumber: { type: 'string' },
        customerId: { type: 'string' },
        totalAmount: { type: 'number' }
      },
      relationships: {
        customer: {
          type: 'belongsTo',
          collection: 'users',
          localField: 'customerId',
          foreignField: '_id',
          alias: 'customer'
        }
      }
    });

    // Products schema
    mockSchemas.set('products', {
      title: 'Products',
      collection: 'products',
      properties: {
        _id: { type: 'string' },
        name: { type: 'string' },
        price: { type: 'number' }
      },
      relationships: {
        categories: {
          type: 'manyToMany',
          collection: 'categories',
          through: 'product_categories',
          localField: '_id',
          throughLocalField: 'productId',
          throughForeignField: 'categoryId',
          foreignField: '_id',
          alias: 'categories'
        }
      }
    });

    // Categories schema
    mockSchemas.set('categories', {
      title: 'Categories',
      collection: 'categories',
      properties: {
        _id: { type: 'string' },
        name: { type: 'string' },
        slug: { type: 'string' }
      }
    });

    schemaLoader.schemas = mockSchemas;

    relationshipParser = new RelationshipQueryParser(schemaLoader);
    filterParser = new RelationshipFilterParser(schemaLoader);
  });

  describe('RelationshipQueryParser', () => {
    describe('parseSelectFields', () => {
      it('should parse simple field selection', () => {
        const result = relationshipParser.parseSelectFields('id,name,email');
        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ type: 'field', name: 'id' });
        expect(result[1]).toEqual({ type: 'field', name: 'name' });
        expect(result[2]).toEqual({ type: 'field', name: 'email' });
      });

      it('should parse relationship with all fields', () => {
        const result = relationshipParser.parseSelectFields('id,name,orders(*)');
        expect(result).toHaveLength(3);
        expect(result[2]).toEqual({
          type: 'relationship',
          alias: 'orders',
          explicitField: undefined,
          subFields: ['*'],
          modifiers: {}
        });
      });

      it('should parse relationship with specific fields', () => {
        const result = relationshipParser.parseSelectFields('id,name,orders(orderNumber,totalAmount)');
        expect(result).toHaveLength(3);
        expect(result[2].type).toBe('relationship');
        expect(result[2].alias).toBe('orders');
        expect(result[2].subFields).toHaveLength(2);
        expect(result[2].subFields[0]).toEqual({ type: 'field', name: 'orderNumber' });
        expect(result[2].subFields[1]).toEqual({ type: 'field', name: 'totalAmount' });
      });

      it('should parse nested relationships', () => {
        const result = relationshipParser.parseSelectFields('id,name,orders(orderNumber,customer(name,email))');
        expect(result).toHaveLength(3);
        expect(result[2].type).toBe('relationship');
        expect(result[2].subFields).toHaveLength(2);
        expect(result[2].subFields[1].type).toBe('relationship');
        expect(result[2].subFields[1].alias).toBe('customer');
      });

      it('should parse relationship with modifiers', () => {
        const result = relationshipParser.parseSelectFields('id,name,orders(*)!order.createdAt.desc!limit.5');
        expect(result).toHaveLength(3);
        expect(result[2].type).toBe('relationship');
        expect(result[2].modifiers).toEqual({
          sort: { createdAt: -1 },
          limit: 5
        });
      });
    });

    describe('buildAggregationPipeline', () => {
      it('should build pipeline for belongsTo relationship', () => {
        const selectQuery = relationshipParser.parseSelectQuery('orders', 'orderNumber,customer(name,email)');
        expect(selectQuery.pipeline).toHaveLength(3);

        // Should have lookup, addFields, and project stages
        expect(selectQuery.pipeline[0]).toHaveProperty('$lookup');
        expect(selectQuery.pipeline[0].$lookup.from).toBe('users');
        expect(selectQuery.pipeline[0].$lookup.as).toBe('customer');
        expect(selectQuery.pipeline[1]).toHaveProperty('$addFields');
        expect(selectQuery.pipeline[2]).toHaveProperty('$project');
      });

      it('should build pipeline for hasMany relationship', () => {
        const selectQuery = relationshipParser.parseSelectQuery('users', 'name,orders(orderNumber,totalAmount)');
        expect(selectQuery.pipeline).toHaveLength(2);

        // Should have lookup and project stages
        expect(selectQuery.pipeline[0]).toHaveProperty('$lookup');
        expect(selectQuery.pipeline[0].$lookup.from).toBe('orders');
        expect(selectQuery.pipeline[0].$lookup.as).toBe('orders');
        expect(selectQuery.pipeline[1]).toHaveProperty('$project');
      });

      it('should build pipeline for manyToMany relationship', () => {
        const selectQuery = relationshipParser.parseSelectQuery('products', 'name,categories(name,slug)');
        expect(selectQuery.pipeline.length).toBeGreaterThan(2);

        // Should have multiple lookup stages for many-to-many
        const lookupStages = selectQuery.pipeline.filter(stage => stage.$lookup);
        expect(lookupStages.length).toBeGreaterThan(1);
      });
    });

    describe('validateRelationshipQuery', () => {
      it('should validate valid relationship queries', () => {
        const selectQuery = relationshipParser.parseSelectQuery('users', 'name,orders(orderNumber)');
        const errors = relationshipParser.validateRelationshipQuery('users', selectQuery.fields);
        expect(errors).toHaveLength(0);
      });

      it('should detect invalid relationships', () => {
        const selectQuery = relationshipParser.parseSelectQuery('users', 'name,invalidRelation(field)');
        const errors = relationshipParser.validateRelationshipQuery('users', selectQuery.fields);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).toContain('Unknown relationship');
      });

      it('should detect invalid fields in relationships', () => {
        const selectQuery = relationshipParser.parseSelectQuery('users', 'name,orders(invalidField)');
        const errors = relationshipParser.validateRelationshipQuery('users', selectQuery.fields);
        expect(errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('RelationshipFilterParser', () => {
    describe('parseFilters', () => {
      it('should parse direct field filters', () => {
        const result = filterParser.parseFilters('users', {
          name: 'eq.John',
          age: 'gte.18'
        });

        expect(result.filters).toEqual({
          name: { $eq: 'John' },
          age: { $gte: 18 }
        });
        expect(Object.keys(result.relationshipFilters)).toHaveLength(0);
      });

      it('should parse relationship filters', () => {
        const result = filterParser.parseFilters('users', {
          'orders.status': 'eq.completed',
          'orders.totalAmount': 'gte.100'
        });

        expect(Object.keys(result.filters)).toHaveLength(0);
        expect(result.relationshipFilters.orders).toEqual({
          status: { $eq: 'completed' },
          totalAmount: { $gte: 100 }
        });
      });

      it('should parse mixed filters', () => {
        const result = filterParser.parseFilters('users', {
          name: 'eq.John',
          'orders.status': 'eq.completed',
          email: 'like.*@example.com'
        });

        expect(result.filters).toEqual({
          name: { $eq: 'John' },
          email: { $regex: '.*@example\\.com', $options: 'i' }
        });
        expect(result.relationshipFilters.orders).toEqual({
          status: { $eq: 'completed' }
        });
      });
    });

    describe('parseOperator', () => {
      it('should parse equality operators', () => {
        expect(filterParser.parseOperator('eq.test')).toEqual({ $eq: 'test' });
        expect(filterParser.parseOperator('neq.test')).toEqual({ $ne: 'test' });
      });

      it('should parse comparison operators', () => {
        expect(filterParser.parseOperator('gt.10')).toEqual({ $gt: 10 });
        expect(filterParser.parseOperator('gte.10')).toEqual({ $gte: 10 });
        expect(filterParser.parseOperator('lt.10')).toEqual({ $lt: 10 });
        expect(filterParser.parseOperator('lte.10')).toEqual({ $lte: 10 });
      });

      it('should parse array operators', () => {
        expect(filterParser.parseOperator('in.(a,b,c)')).toEqual({ $in: ['a', 'b', 'c'] });
        expect(filterParser.parseOperator('nin.(1,2,3)')).toEqual({ $nin: [1, 2, 3] });
      });

      it('should parse like operators', () => {
        expect(filterParser.parseOperator('like.test*')).toEqual({
          $regex: 'test.*',
          $options: 'i'
        });
      });

      it('should handle values without operators', () => {
        expect(filterParser.parseOperator('simpleValue')).toEqual({ $eq: 'simpleValue' });
      });
    });

    describe('parseValue', () => {
      it('should parse different value types', () => {
        expect(filterParser.parseValue('123')).toBe(123);
        expect(filterParser.parseValue('123.45')).toBe(123.45);
        expect(filterParser.parseValue('true')).toBe(true);
        expect(filterParser.parseValue('false')).toBe(false);
        expect(filterParser.parseValue('null')).toBe(null);
        expect(filterParser.parseValue('string')).toBe('string');
      });

      it('should handle ObjectId patterns', () => {
        const objectIdStr = '507f1f77bcf86cd799439011';
        expect(filterParser.parseValue(objectIdStr)).toBe(objectIdStr);
      });

      it('should parse date formats', () => {
        const isoDate = '2024-01-15T10:30:00.000Z';
        const result = filterParser.parseValue(isoDate);
        expect(result).toBeInstanceOf(Date);
      });
    });

    describe('validateFilters', () => {
      it('should validate correct filters', () => {
        const errors = filterParser.validateFilters('users', {
          name: 'eq.John',
          email: 'like.*@example.com'
        });
        expect(errors).toHaveLength(0);
      });

      it('should detect invalid field names', () => {
        const errors = filterParser.validateFilters('users', {
          invalidField: 'eq.value'
        });
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).toContain('Unknown field');
      });

      it('should detect invalid relationships in filters', () => {
        const errors = filterParser.validateFilters('users', {
          'invalidRelation.field': 'eq.value'
        });
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).toContain('Unknown relationship');
      });

      it('should detect invalid operators', () => {
        const errors = filterParser.validateFilters('users', {
          name: 'invalidOp.value'
        });
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).toContain('Invalid operator');
      });
    });
  });

  describe('Integration Tests', () => {
    it('should handle complex relationship queries with filters', () => {
      const selectQuery = relationshipParser.parseSelectQuery(
        'users',
        'name,email,orders(orderNumber,totalAmount,customer(name))'
      );

      const { filters, relationshipFilters } = filterParser.parseFilters('users', {
        name: 'like.John*',
        'orders.status': 'eq.completed',
        'orders.totalAmount': 'gte.100'
      });

      expect(selectQuery.hasRelationships).toBe(true);
      expect(selectQuery.fields).toHaveLength(3);
      expect(filters).toEqual({
        name: { $regex: 'John.*', $options: 'i' }
      });
      expect(relationshipFilters.orders).toEqual({
        status: { $eq: 'completed' },
        totalAmount: { $gte: 100 }
      });
    });

    it('should build complete aggregation pipeline', () => {
      const selectFields = relationshipParser.parseSelectFields('name,orders(orderNumber,customer(name))');
      const pipeline = filterParser.buildFilteredPipeline(
        'users',
        selectFields,
        { name: { $regex: 'John.*', $options: 'i' } },
        { orders: { status: { $eq: 'completed' } } },
        {}
      );

      expect(pipeline.length).toBeGreaterThan(0);

      // Should contain match stage for direct filters
      const matchStages = pipeline.filter(stage => stage.$match);
      expect(matchStages).toHaveLength(1);

      // Should contain lookup stages for relationships
      const lookupStages = pipeline.filter(stage => stage.$lookup);
      expect(lookupStages.length).toBeGreaterThan(0);
    });
  });
});
