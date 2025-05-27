// Global test setup
const { MongoMemoryServer } = require('mongodb-memory-server');

module.exports = async () => {
  // Start in-memory MongoDB for testing
  const mongod = await MongoMemoryServer.create({
    instance: {
      port: 27018, // Use different port from development
      dbName: 'mongorest_test'
    }
  });

  const uri = mongod.getUri();

  // Store the URI and instance for cleanup
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB_NAME = 'mongorest_test';
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret';

  global.__MONGOD__ = mongod;

  console.log('🧪 Test MongoDB started at:', uri);
};
