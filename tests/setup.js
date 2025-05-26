// Test setup utilities
const { MongoClient } = require('mongodb');

// Global test utilities
global.testUtils = {
  // Create test JWT token
  createTestToken: (payload = {}) => {
    const jwt = require('jsonwebtoken');
    return jwt.sign({
      sub: 'test_user_123',
      role: 'admin',
      permissions: ['*'],
      collections: ['*'],
      functions: ['*'],
      ...payload
    }, process.env.JWT_SECRET, { expiresIn: '1h' });
  },

  // Create MongoDB connection for tests
  createTestConnection: async () => {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    return client;
  },

  // Clean test database
  cleanDatabase: async (client) => {
    const db = client.db(process.env.MONGODB_DB_NAME);
    const collections = await db.listCollections().toArray();
    
    for (const collection of collections) {
      await db.collection(collection.name).deleteMany({});
    }
  },

  // Create test documents
  createTestUser: (overrides = {}) => ({
    email: 'test@example.com',
    name: 'Test User',
    profile: {
      age: 25,
      country: 'Vietnam',
      interests: ['testing']
    },
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }),

  createTestProduct: (overrides = {}) => ({
    sku: 'TEST-001',
    name: 'Test Product',
    description: 'A test product',
    category: 'electronics',
    price: 99.99,
    currency: 'USD',
    inventory: {
      quantity: 100,
      reserved: 0,
      lowStockThreshold: 10
    },
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }),

  createTestOrder: (customerId, productId, overrides = {}) => ({
    orderNumber: 'ORD-TEST-001',
    customerId,
    items: [{
      productId,
      sku: 'TEST-001',
      name: 'Test Product',
      price: 99.99,
      quantity: 1,
      subtotal: 99.99
    }],
    shippingAddress: {
      fullName: 'Test User',
      address: '123 Test Street',
      city: 'Test City',
      country: 'Vietnam'
    },
    payment: {
      method: 'credit_card',
      status: 'completed',
      amount: 99.99
    },
    subtotal: 99.99,
    tax: 10.00,
    shipping: 5.00,
    totalAmount: 114.99,
    currency: 'USD',
    status: 'completed',
    orderDate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }),

  // Async wait utility
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Generate random string
  randomString: (length = 8) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
};

// Configure longer timeout for async operations
jest.setTimeout(30000);

// Suppress console logs during tests unless NODE_ENV is 'test-verbose'
if (process.env.NODE_ENV !== 'test-verbose') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
}
