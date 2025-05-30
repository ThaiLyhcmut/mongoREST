import { MongoClient, ObjectId, Db, Collection, MongoClientOptions, FindOptions as MongoFindOptions } from 'mongodb';
import {
  DatabaseManagerConfig,
  DatabaseStats,
  HealthCheckResult,
  PaginationResult,
  FindOptions,
  IndexDefinition,
  CollectionInfo
} from '../config/core/database-manager.config';

class DatabaseManager {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private isConnected: boolean = false;
  private connectionString: string;
  private dbName: string;
  private options: MongoClientOptions;

  constructor() {
    this.connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/mongorest';
    this.dbName = process.env.MONGODB_DB_NAME || 'mongorest';
    
    // Connection options
    this.options = {
      maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || '10'),
      minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE || '5'),
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4, // Use IPv4, skip trying IPv6
      retryWrites: true,
      retryReads: true
    };
  }

  async connect(): Promise<Db> {
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
      console.error('❌ Failed to connect to MongoDB:', (error as Error).message);
      throw error;
    }
  }

  private setupEventListeners(): void {
    if (!this.client) return;

    this.client.on('serverOpening', () => {
      console.log('🔗 MongoDB server connection opening');
    });

    this.client.on('serverClosed', () => {
      console.log('🔌 MongoDB server connection closed');
      this.isConnected = false;
    });

    this.client.on('error', (error: Error) => {
      console.error('❌ MongoDB connection error:', error);
      this.isConnected = false;
    });

    this.client.on('timeout', () => {
      console.warn('⏰ MongoDB connection timeout');
    });
  }

  async disconnect(): Promise<void> {
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
  getDb(): Db {
    if (!this.isConnected || !this.db) {
      throw new Error('Database not connected');
    }
    return this.db;
  }

  // Get collection
  collection<T extends Document = any>(collectionName: string): Collection<T> {
    return this.getDb().collection<T>(collectionName);
  }

  // Health check
  async healthCheck(): Promise<HealthCheckResult> {
    try {
      if (!this.isConnected || !this.db) {
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
          host: this.client!.options.hosts[0].toString(),
          poolSize: this.client!.options.maxPoolSize || 10,
          connected: this.isConnected
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: (error as Error).message
      };
    }
  }

  // Utility methods
  isValidObjectId(id: string): boolean {
    return ObjectId.isValid(id);
  }

  createObjectId(id?: string): ObjectId {
    if (id && this.isValidObjectId(id)) {
      return new ObjectId(id);
    }
    return new ObjectId();
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Create indexes based on schema definitions
  async createIndexes(collectionName: string, indexes: IndexDefinition[]): Promise<void> {
    if (!indexes || !Array.isArray(indexes)) {
      return;
    }

    const collection = this.collection(collectionName);
    
    try {
      for (const indexDef of indexes) {
        const indexSpec = indexDef.fields;
        const options: any = { 
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
      console.error(`❌ Failed to create indexes for ${collectionName}:`, (error as Error).message);
      // Don't throw error, just log it - indexes are not critical for API functionality
    }
  }

  // Initialize collections with indexes
  async initializeCollections(schemas: Map<string, any>): Promise<void> {
    console.log('Initializing collections and indexes...');
    
    for (const [collectionName, schema] of schemas) {
      try {
        // Create collection if it doesn't exist
        const collections = await this.db!.listCollections({ name: collectionName }).toArray();
        if (collections.length === 0) {
          await this.db!.createCollection(collectionName);
          console.log(`  📦 Created collection: ${collectionName}`);
        }

        // Create indexes
        if (schema.indexes) {
          await this.createIndexes(collectionName, schema.indexes);
        }
      } catch (error) {
        console.error(`❌ Failed to initialize collection ${collectionName}:`, (error as Error).message);
      }
    }
    
    console.log('✅ Collections and indexes initialized');
  }

  // Transaction support
  async withTransaction<T>(callback: (session: any) => Promise<T>): Promise<T> {
    const session = this.client!.startSession();
    
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
  async aggregate<T extends Document = any>(collectionName: string, pipeline: any[], options: any = {}): Promise<T[]> {
    const collection = this.collection(collectionName);
    
    // Add execution timeout
    const aggregateOptions = {
      maxTimeMS: parseInt(process.env.FUNCTION_TIMEOUT || '30000'),
      ...options
    };

    return await collection.aggregate<T>(pipeline, aggregateOptions).toArray();
  }

  // Find with pagination helper
  async findWithPagination<T extends Document = any>(
    collectionName: string, 
    query: any = {}, 
    options: FindOptions = {}
  ): Promise<PaginationResult<T>> {
    const collection = this.collection<T>(collectionName);
    
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
        .find(query, { projection, ...findOptions } as MongoFindOptions<T>)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments(query)
    ]);

    const totalPages = Math.ceil(totalCount / limit);
    
    return {
      documents: documents as (T)[],
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
  async bulkWrite(collectionName: string, operations: any[], options: any = {}): Promise<any> {
    const collection = this.collection(collectionName);
    
    const bulkOptions = {
      ordered: false, // Allow parallel execution
      ...options
    };

    return await collection.bulkWrite(operations, bulkOptions);
  }

  // Database stats and monitoring
  async getStats(): Promise<DatabaseStats> {
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
      throw new Error(`Failed to get database stats: ${(error as Error).message}`);
    }
  }

  // List all collections
  async listCollections(): Promise<CollectionInfo[]> {
    try {
      const collections = await this.db!.listCollections().toArray();
      return collections.map(col => ({
        name: col.name,
        type: col.type,
        options: (col as any).options
      }));
    } catch (error) {
      throw new Error(`Failed to list collections: ${(error as Error).message}`);
    }
  }
}

export default DatabaseManager;
