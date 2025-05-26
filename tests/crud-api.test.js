const fastify = require('fastify');
const { MongoClient } = require('mongodb');

describe('CRUD API Integration Tests', () => {
  let app;
  let mongoClient;
  let db;

  beforeAll(async () => {
    // Create Fastify instance
    app = fastify({ logger: false });

    // Connect to test MongoDB
    mongoClient = await global.testUtils.createTestConnection();
    db = mongoClient.db(process.env.MONGODB_DB_NAME);

    // Mock the components needed for server initialization
    const mockSchemaLoader = {
      schemas: new Map([
        ['users', {
          title: 'Users',
          type: 'object',
          collection: 'users',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            status: { type: 'string', enum: ['active', 'inactive'] }
          },
          required: ['name', 'email'],
          mongorest: {
            permissions: {
              read: ['user', 'admin'],
              create: ['admin'],
              update: ['admin'],
              delete: ['admin']
            }
          }
        }]
      ]),
      functions: new Map(),
      validateDocument: (collection, doc) => ({ valid: true })
    };

    const mockDbManager = {
      collection: (name) => db.collection(name),
      isValidObjectId: (id) => /^[0-9a-fA-F]{24}$/.test(id),
      findWithPagination: async (collectionName, query, options) => {
        const collection = db.collection(collectionName);
        const { page = 1, limit = 50, sort = {} } = options;
        const skip = (page - 1) * limit;

        const [documents, totalCount] = await Promise.all([
          collection.find(query).sort(sort).skip(skip).limit(limit).toArray(),
          collection.countDocuments(query)
        ]);

        return {
          documents,
          pagination: {
            page,
            limit,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
            hasNext: page * limit < totalCount,
            hasPrevious: page > 1
          }
        };
      }
    };

    const mockAuthManager = {
      authenticate: () => async (request, reply) => {
        // Mock JWT verification
        request.user = {
          sub: 'test_user',
          role: 'admin',
          permissions: ['*']
        };
      },
      authorizeCollection: () => () => async (request, reply) => {
        // Mock authorization - always allow for tests
      },
      canAccessCollection: () => true
    };

    const mockValidationManager = {
      validateMethodOperation: () => async (request, reply) => {
        // Mock validation - always allow for tests
      },
      buildMongoQuery: (queryParams) => {
        const query = {};
        const options = { page: 1, limit: 50, sort: {} };

        // Simple query building for tests
        Object.entries(queryParams).forEach(([key, value]) => {
          if (key === 'page') options.page = parseInt(value);
          else if (key === 'limit') options.limit = parseInt(value);
          else if (key === 'sort') options.sort[value] = 1;
          else query[key] = value;
        });

        return { query, options };
      }
    };

    // Register decorators
    app.decorate('authenticate', mockAuthManager.authenticate());
    app.decorate('authorizeCollection', mockAuthManager.authorizeCollection());
    app.decorate('validateMethodOperation', mockValidationManager.validateMethodOperation());

    // Add context to request
    app.decorateRequest('context', null);
    app.addHook('onRequest', async (request) => {
      request.context = {
        schemaLoader: mockSchemaLoader,
        dbManager: mockDbManager,
        authManager: mockAuthManager,
        validationManager: mockValidationManager
      };
    });

    // Register CRUD routes
    const crudRoutes = require('../src/routes/crud');
    await app.register(crudRoutes, { prefix: '/crud' });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await mongoClient.close();
  });

  beforeEach(async () => {
    await global.testUtils.cleanDatabase(mongoClient);
  });

  describe('GET /crud/users', () => {
    test('should return empty array when no users exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/crud/users'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
      expect(data.meta.totalCount).toBe(0);
    });

    test('should return users when they exist', async () => {
      // Insert test users
      const testUser1 = global.testUtils.createTestUser({ name: 'User 1' });
      const testUser2 = global.testUtils.createTestUser({ name: 'User 2', email: 'user2@test.com' });

      await db.collection('users').insertMany([testUser1, testUser2]);

      const response = await app.inject({
        method: 'GET',
        url: '/crud/users'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.meta.totalCount).toBe(2);
    });

    test('should support pagination', async () => {
      // Insert 5 test users
      const testUsers = Array.from({ length: 5 }, (_, i) =>
        global.testUtils.createTestUser({
          name: `User ${i + 1}`,
          email: `user${i + 1}@test.com`
        })
      );

      await db.collection('users').insertMany(testUsers);

      const response = await app.inject({
        method: 'GET',
        url: '/crud/users?page=2&limit=2'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.meta.page).toBe(2);
      expect(data.meta.limit).toBe(2);
      expect(data.meta.totalCount).toBe(5);
    });

    test('should support filtering', async () => {
      const activeUser = global.testUtils.createTestUser({ status: 'active' });
      const inactiveUser = global.testUtils.createTestUser({
        email: 'inactive@test.com',
        status: 'inactive'
      });

      await db.collection('users').insertMany([activeUser, inactiveUser]);

      const response = await app.inject({
        method: 'GET',
        url: '/crud/users?status=active'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].status).toBe('active');
    });
  });

  describe('GET /crud/users/:id', () => {
    test('should return user by ID', async () => {
      const testUser = global.testUtils.createTestUser();
      const result = await db.collection('users').insertOne(testUser);
      const userId = result.insertedId.toString();

      const response = await app.inject({
        method: 'GET',
        url: `/crud/users/${userId}`
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data._id).toBe(userId);
      expect(data.data.email).toBe(testUser.email);
    });

    test('should return 404 for non-existent user', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await app.inject({
        method: 'GET',
        url: `/crud/users/${fakeId}`
      });

      expect(response.statusCode).toBe(404);
      const data = JSON.parse(response.payload);
      expect(data.error).toBe('Document not found');
    });

    test('should return 400 for invalid ID format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/crud/users/invalid-id'
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.payload);
      expect(data.error).toBe('Invalid ID format');
    });
  });

  describe('POST /crud/users', () => {
    test('should create new user', async () => {
      const newUser = {
        name: 'New User',
        email: 'new@test.com',
        status: 'active'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/crud/users',
        payload: newUser
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe(newUser.name);
      expect(data.data.email).toBe(newUser.email);
      expect(data.data._id).toBeDefined();
      expect(data.data.createdAt).toBeDefined();

      // Verify user was actually created in database
      const createdUser = await db.collection('users').findOne({ email: newUser.email });
      expect(createdUser).toBeTruthy();
    });

    test('should handle validation errors', async () => {
      const invalidUser = {
        name: 'Test User'
        // Missing required email field
      };

      const response = await app.inject({
        method: 'POST',
        url: '/crud/users',
        payload: invalidUser
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.payload);
      expect(data.error).toBe('Validation failed');
    });
  });

  describe('PATCH /crud/users/:id', () => {
    test('should update user fields', async () => {
      const testUser = global.testUtils.createTestUser();
      const result = await db.collection('users').insertOne(testUser);
      const userId = result.insertedId.toString();

      const updates = {
        name: 'Updated Name',
        status: 'inactive'
      };

      const response = await app.inject({
        method: 'PATCH',
        url: `/crud/users/${userId}`,
        payload: updates
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe(updates.name);
      expect(data.data.status).toBe(updates.status);
      expect(data.data.email).toBe(testUser.email); // Should preserve unchanged fields

      // Verify update in database
      const updatedUser = await db.collection('users').findOne({ _id: result.insertedId });
      expect(updatedUser.name).toBe(updates.name);
      expect(updatedUser.status).toBe(updates.status);
    });

    test('should return 404 for non-existent user', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await app.inject({
        method: 'PATCH',
        url: `/crud/users/${fakeId}`,
        payload: { name: 'Updated Name' }
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /crud/users/:id', () => {
    test('should delete user', async () => {
      const testUser = global.testUtils.createTestUser();
      const result = await db.collection('users').insertOne(testUser);
      const userId = result.insertedId.toString();

      const response = await app.inject({
        method: 'DELETE',
        url: `/crud/users/${userId}`
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data._id).toBe(userId);
      expect(data.data.deleted).toBe(true);

      // Verify user was actually deleted
      const deletedUser = await db.collection('users').findOne({ _id: result.insertedId });
      expect(deletedUser).toBeNull();
    });

    test('should return 404 for non-existent user', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await app.inject({
        method: 'DELETE',
        url: `/crud/users/${fakeId}`
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
