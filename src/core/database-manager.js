const { MongoClient, ObjectId } = require('mongodb');

class DatabaseManager {
  constructor() {
    this.client = null;
    this.db = null;
    this.isConnected = false;
    this.connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/mongorest';
    this.dbName = process.env.MONGODB_DB_NAME || 'mongorest';
    
    // Connection options
    this.options = {
      maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE) || 10,
      minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE) || 5,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4, // Use IPv4, skip trying IPv6
      retryWrites: true,
      retryReads: true
    };
  }

  async connect() {
    try {
      console.log('Connecting to MongoDB...');
      console.log(`Connection string: ${this.connectionString.replace(/\/\/.*:.*@/, '//***:***@')}`);
      
      this.client = new MongoClient(this.connectionString, this.options);
      await this.client.connect();
      
      // Test the connection
      await this.client.db('admin').command({ ping: 1 });
      
      this.db = this.client.db(this.dbName);
      this.isConnected = true;
      
      console.log('✅ Connected to MongoDB successfully');
      console.log(`📊 Database: ${this.dbName}`);
      
      // Setup connection event listeners
      this.setupEventListeners();
      
      return this.db;
    } catch (error) {
      console.error('❌ Failed to connect to MongoDB:', error.message);
      throw error;
    }
  }

  setupEventListeners() {
    this.client.on('serverOpening', () => {
      console.log('🔗 MongoDB server connection opening');
    });

    this.client.on('serverClosed', () => {
      console.log('🔌 MongoDB server connection closed');
      this.isConnected = false;
    });

    this.client.on('error', (error) => {
      console.error('❌ MongoDB connection error:', error);
      this.isConnected = false;
    });

    this.client.on('timeout', () => {
      console.warn('⏰ MongoDB connection timeout');
    });
  }

  async disconnect() {
    if (this.client) {
      try {
        await this.client.close();
        this.isConnected = false;
        console.log('✅ Disconnected from MongoDB');
      } catch (error) {
        console.error('❌ Error disconnecting from MongoDB:', error);
        throw error;
      }
    }
  }

  // Get database instance
  getDb() {
    if (!this.isConnected || !this.db) {
      throw new Error('Database not connected');
    }
    return this.db;
  }

  // Get collection
  collection(collectionName) {
    return this.getDb().collection(collectionName);
  }

  // Health check
  async healthCheck() {
    try {
      if (!this.isConnected) {
        return { status: 'disconnected', error: 'Not connected to database' };
      }

      const result = await this.db.admin().ping();
      const stats = await this.db.stats();
      
      return {
        status: 'connected',
        database: this.dbName,
        serverStatus: result,
        stats: {
          collections: stats.collections,
          documents: stats.objects,
          dataSize: this.formatBytes(stats.dataSize),
          storageSize: this.formatBytes(stats.storageSize),
          indexes: stats.indexes,
          indexSize: this.formatBytes(stats.indexSize)
        },
        connection: {
          host: this.client.options.hosts[0],
          poolSize: this.client.options.maxPoolSize,
          connected: this.isConnected
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  // Utility methods
  isValidObjectId(id) {
    return ObjectId.isValid(id);
  }

  createObjectId(id) {
    if (id && this.isValidObjectId(id)) {
      return new ObjectId(id);
    }
    return new ObjectId();
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Create indexes based on schema definitions
  async createIndexes(collectionName, indexes) {
    if (!indexes || !Array.isArray(indexes)) {
      return;
    }

    const collection = this.collection(collectionName);
    
    try {
      for (const indexDef of indexes) {
        const indexSpec = indexDef.fields;
        const options = { 
          background: true,
          ...indexDef.options 
        };

        // Handle unique constraint
        if (indexDef.unique) {
          options.unique = true;
        }

        // Handle sparse indexes
        if (indexDef.sparse) {
          options.sparse = true;
        }

        // Handle TTL indexes
        if (indexDef.expireAfterSeconds) {
          options.expireAfterSeconds = indexDef.expireAfterSeconds;
        }

        // Create the index
        await collection.createIndex(indexSpec, options);
        console.log(`  📋 Created index on ${collectionName}:`, indexSpec);
      }
    } catch (error) {
      console.error(`❌ Failed to create indexes for ${collectionName}:`, error.message);
      // Don't throw error, just log it - indexes are not critical for API functionality
    }
  }

  // Initialize collections with indexes
  async initializeCollections(schemas) {
    console.log('Initializing collections and indexes...');
    
    for (const [collectionName, schema] of schemas) {
      try {
        // Create collection if it doesn't exist
        const collections = await this.db.listCollections({ name: collectionName }).toArray();
        if (collections.length === 0) {
          await this.db.createCollection(collectionName);
          console.log(`  📦 Created collection: ${collectionName}`);
        }

        // Create indexes
        if (schema.indexes) {
          await this.createIndexes(collectionName, schema.indexes);
        }
      } catch (error) {
        console.error(`❌ Failed to initialize collection ${collectionName}:`, error.message);
      }
    }
    
    console.log('✅ Collections and indexes initialized');
  }

  // Transaction support
  async withTransaction(callback) {
    const session = this.client.startSession();
    
    try {
      const result = await session.withTransaction(async () => {
        return await callback(session);
      });
      
      return result;
    } catch (error) {
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // Aggregation pipeline helper
  async aggregate(collectionName, pipeline, options = {}) {
    const collection = this.collection(collectionName);
    
    // Add execution timeout
    const aggregateOptions = {
      maxTimeMS: parseInt(process.env.FUNCTION_TIMEOUT) || 30000,
      ...options
    };

    return await collection.aggregate(pipeline, aggregateOptions).toArray();
  }

  // Find with pagination helper
  async findWithPagination(collectionName, query = {}, options = {}) {
    const collection = this.collection(collectionName);
    
    const {
      page = 1,
      limit = 50,
      sort = {},
      projection = {},
      ...findOptions
    } = options;

    const skip = (page - 1) * limit;
    
    // Get total count and documents in parallel
    const [documents, totalCount] = await Promise.all([
      collection
        .find(query, { projection, ...findOptions })
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments(query)
    ]);

    const totalPages = Math.ceil(totalCount / limit);
    
    return {
      documents,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1
      }
    };
  }

  // Bulk operations helper
  async bulkWrite(collectionName, operations, options = {}) {
    const collection = this.collection(collectionName);
    
    const bulkOptions = {
      ordered: false, // Allow parallel execution
      ...options
    };

    return await collection.bulkWrite(operations, bulkOptions);
  }

  // Database stats and monitoring
  async getStats() {
    try {
      const db = this.getDb();
      const [dbStats, serverStatus] = await Promise.all([
        db.stats(),
        db.admin().serverStatus()
      ]);

      return {
        database: {
          name: this.dbName,
          collections: dbStats.collections,
          documents: dbStats.objects,
          dataSize: this.formatBytes(dbStats.dataSize),
          storageSize: this.formatBytes(dbStats.storageSize),
          indexes: dbStats.indexes,
          indexSize: this.formatBytes(dbStats.indexSize)
        },
        server: {
          version: serverStatus.version,
          uptime: serverStatus.uptime,
          connections: serverStatus.connections,
          memory: {
            resident: this.formatBytes(serverStatus.mem.resident * 1024 * 1024),
            virtual: this.formatBytes(serverStatus.mem.virtual * 1024 * 1024)
          },
          metrics: {
            operations: serverStatus.opcounters,
            network: {
              bytesIn: this.formatBytes(serverStatus.network.bytesIn),
              bytesOut: this.formatBytes(serverStatus.network.bytesOut)
            }
          }
        }
      };
    } catch (error) {
      throw new Error(`Failed to get database stats: ${error.message}`);
    }
  }

  // List all collections
  async listCollections() {
    try {
      const collections = await this.db.listCollections().toArray();
      return collections.map(col => ({
        name: col.name,
        type: col.type,
        options: col.options
      }));
    } catch (error) {
      throw new Error(`Failed to list collections: ${error.message}`);
    }
  }
}

module.exports = DatabaseManager;
