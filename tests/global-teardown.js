// Global test teardown
module.exports = async () => {
  // Stop the in-memory MongoDB
  if (global.__MONGOD__) {
    await global.__MONGOD__.stop();
    console.log('🧪 Test MongoDB stopped');
  }
};
