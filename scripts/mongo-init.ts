// MongoDB initialization script
// This script runs when the MongoDB container starts for the first time

import { Db, MongoClient, ObjectId } from 'mongodb';

interface InitializationResult {
  success: boolean;
  message: string;
  collections: {
    users: number;
    products: number; 
    orders: number;
    reports: number;
    syncLogs: number;
  };
}

class MongoDBInitializer {
  private db: Db | null = null;

  constructor(private mongoUri: string, private dbName: string) {}

  private log(message: string): void {
    console.log(message);
  }

  async connect(): Promise<void> {
    const client = new MongoClient(this.mongoUri);
    await client.connect();
    this.db = client.db(this.dbName);
    this.log('🚀 Initializing MongoREST database...');
  }

  async createUsers(): Promise<ObjectId[]> {
    this.log('📄 Creating users collection with sample data...');
    
    const users = [
      {
        email: "admin@mongorest.com",
        name: "Admin User",
        profile: {
          age: 30,
          country: "Vietnam",
          interests: ["technology", "databases", "apis"]
        },
        status: "active",
        lastLogin: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        email: "analyst@mongorest.com", 
        name: "Data Analyst",
        profile: {
          age: 28,
          country: "Thailand",
          interests: ["analytics", "reporting", "data-science"]
        },
        status: "active",
        lastLogin: new Date(Date.now() - 86400000), // 1 day ago
        createdAt: new Date(Date.now() - 7 * 86400000), // 7 days ago
        updatedAt: new Date()
      },
      {
        email: "developer@mongorest.com",
        name: "Developer User", 
        profile: {
          age: 26,
          country: "Singapore",
          interests: ["programming", "apis", "mongodb"]
        },
        status: "active",
        lastLogin: new Date(Date.now() - 3600000), // 1 hour ago
        createdAt: new Date(Date.now() - 30 * 86400000), // 30 days ago
        updatedAt: new Date()
      },
      {
        email: "user@example.com",
        name: "Regular User",
        profile: {
          age: 25,
          country: "Malaysia",
          interests: ["shopping", "technology"]
        },
        status: "active",
        lastLogin: new Date(Date.now() - 2 * 86400000), // 2 days ago
        createdAt: new Date(Date.now() - 60 * 86400000), // 60 days ago
        updatedAt: new Date()
      }
    ];

    const result = await this.db!.collection('users').insertMany(users);
    this.log(`✅ Created users collection with ${users.length} documents`);
    return Object.values(result.insertedIds);
  }

  async createProducts(): Promise<ObjectId[]> {
    this.log('📄 Creating products collection...');
    
    const products = [
      {
        sku: "LAPTOP-001",
        name: "MacBook Pro 16-inch",
        description: "Apple MacBook Pro with M2 chip, perfect for developers",
        category: "electronics",
        subcategory: "laptops",
        price: 2499.99,
        currency: "USD",
        inventory: {
          quantity: 50,
          reserved: 5,
          lowStockThreshold: 10
        },
        images: [
          "https://example.com/images/macbook-1.jpg",
          "https://example.com/images/macbook-2.jpg"
        ],
        tags: ["apple", "laptop", "developer", "premium"],
        specifications: {
          processor: "Apple M2",
          memory: "16GB",
          storage: "512GB SSD",
          display: "16-inch Retina"
        },
        ratings: {
          average: 4.8,
          count: 245
        },
        status: "active",
        createdAt: new Date(Date.now() - 90 * 86400000),
        updatedAt: new Date()
      },
      {
        sku: "PHONE-002",
        name: "iPhone 15 Pro",
        description: "Latest iPhone with advanced camera system",
        category: "electronics",
        subcategory: "smartphones",
        price: 999.99,
        currency: "USD",
        inventory: {
          quantity: 100,
          reserved: 15,
          lowStockThreshold: 20
        },
        images: [
          "https://example.com/images/iphone-1.jpg"
        ],
        tags: ["apple", "smartphone", "camera", "5g"],
        specifications: {
          processor: "A17 Pro",
          memory: "128GB",
          display: "6.1-inch Super Retina XDR",
          camera: "48MP Main"
        },
        ratings: {
          average: 4.6,
          count: 892
        },
        status: "active",
        createdAt: new Date(Date.now() - 60 * 86400000),
        updatedAt: new Date()
      },
      {
        sku: "BOOK-003",
        name: "MongoDB: The Definitive Guide",
        description: "Comprehensive guide to MongoDB database",
        category: "books",
        subcategory: "technical",
        price: 49.99,
        currency: "USD",
        inventory: {
          quantity: 200,
          reserved: 0,
          lowStockThreshold: 50
        },
        images: [
          "https://example.com/images/mongodb-book.jpg"
        ],
        tags: ["mongodb", "database", "technical", "programming"],
        specifications: {
          pages: 512,
          publisher: "O'Reilly",
          isbn: "978-1491954461"
        },
        ratings: {
          average: 4.4,
          count: 156
        },
        status: "active",
        createdAt: new Date(Date.now() - 120 * 86400000),
        updatedAt: new Date()
      }
    ];

    const result = await this.db!.collection('products').insertMany(products);
    this.log(`✅ Created products collection with ${products.length} documents`);
    return Object.values(result.insertedIds);
  }

  async createOrders(userIds: ObjectId[], productIds: ObjectId[]): Promise<ObjectId[]> {
    this.log('📄 Creating orders collection...');
    
    const users = await this.db!.collection('users').find({}).toArray();
    const products = await this.db!.collection('products').find({}).toArray();

    const orders = [
      {
        orderNumber: "ORD-20241201",
        customerId: users[0]._id,
        items: [
          {
            productId: products[0]._id,
            sku: products[0].sku,
            name: products[0].name,
            price: products[0].price,
            quantity: 1,
            subtotal: products[0].price
          }
        ],
        shippingAddress: {
          fullName: users[0].name,
          address: "123 Tech Street",
          city: "Ho Chi Minh City",
          country: "Vietnam",
          phone: "+84123456789"
        },
        billingAddress: {
          fullName: users[0].name,
          address: "123 Tech Street", 
          city: "Ho Chi Minh City",
          country: "Vietnam"
        },
        payment: {
          method: "credit_card",
          status: "completed",
          transactionId: "txn_123456789",
          amount: products[0].price
        },
        subtotal: products[0].price,
        tax: products[0].price * 0.1,
        shipping: 25.00,
        discount: 0,
        totalAmount: products[0].price + (products[0].price * 0.1) + 25.00,
        currency: "USD",
        status: "delivered",
        orderDate: new Date(Date.now() - 7 * 86400000),
        shippedDate: new Date(Date.now() - 5 * 86400000),
        deliveredDate: new Date(Date.now() - 3 * 86400000),
        createdAt: new Date(Date.now() - 7 * 86400000),
        updatedAt: new Date()
      },
      {
        orderNumber: "ORD-20241202",
        customerId: users[1]._id,
        items: [
          {
            productId: products[1]._id,
            sku: products[1].sku,
            name: products[1].name,
            price: products[1].price,
            quantity: 1,
            subtotal: products[1].price
          },
          {
            productId: products[2]._id,
            sku: products[2].sku,
            name: products[2].name,
            price: products[2].price,
            quantity: 2,
            subtotal: products[2].price * 2
          }
        ],
        shippingAddress: {
          fullName: users[1].name,
          address: "456 Data Avenue",
          city: "Bangkok",
          country: "Thailand",
          phone: "+66123456789"
        },
        billingAddress: {
          fullName: users[1].name,
          address: "456 Data Avenue",
          city: "Bangkok", 
          country: "Thailand"
        },
        payment: {
          method: "paypal",
          status: "completed",
          transactionId: "txn_987654321",
          amount: products[1].price + (products[2].price * 2)
        },
        subtotal: products[1].price + (products[2].price * 2),
        tax: (products[1].price + (products[2].price * 2)) * 0.08,
        shipping: 15.00,
        discount: 50.00,
        totalAmount: (products[1].price + (products[2].price * 2)) + ((products[1].price + (products[2].price * 2)) * 0.08) + 15.00 - 50.00,
        currency: "USD", 
        status: "shipped",
        orderDate: new Date(Date.now() - 3 * 86400000),
        shippedDate: new Date(Date.now() - 1 * 86400000),
        createdAt: new Date(Date.now() - 3 * 86400000),
        updatedAt: new Date()
      }
    ];

    const result = await this.db!.collection('orders').insertMany(orders);
    this.log(`✅ Created orders collection with ${orders.length} documents`);
    return Object.values(result.insertedIds);
  }

  async createSystemCollections(userIds: ObjectId[]): Promise<void> {
    this.log('📄 Creating system collections...');
    
    await this.db!.collection('reports').insertMany([
      {
        type: "userAnalytics",
        reportId: "report_001",
        generatedAt: new Date(Date.now() - 86400000),
        generatedBy: userIds[0],
        parameters: {
          dateRange: {
            start: "2024-11-01",
            end: "2024-11-30"
          },
          segments: ["country"]
        },
        data: {
          summary: {
            totalUsers: 4,
            activeUsers: 4,
            newUsers: 2
          }
        },
        status: "completed"
      }
    ]);

    await this.db!.collection('sync_logs').insertMany([
      {
        type: "crm_user_sync",
        timestamp: new Date(Date.now() - 3600000),
        syncId: "sync_001",
        usersProcessed: 4,
        success: true,
        executedBy: userIds[0],
        dryRun: false
      }
    ]);

    this.log('✅ Created system collections');
  }

  async createIndexes(): Promise<void> {
    this.log('📋 Creating indexes...');

    // Users indexes
    await this.db!.collection('users').createIndexes([
      { key: { email: 1 }, unique: true },
      { key: { createdAt: -1 } },
      { key: { 'profile.country': 1, status: 1 } },
      { key: { name: 'text', email: 'text' } }
    ]);

    // Products indexes  
    await this.db!.collection('products').createIndexes([
      { key: { sku: 1 }, unique: true },
      { key: { category: 1, status: 1 } },
      { key: { name: 'text', description: 'text', tags: 'text' } },
      { key: { price: 1 } },
      { key: { createdAt: -1 } }
    ]);

    // Orders indexes
    await this.db!.collection('orders').createIndexes([
      { key: { orderNumber: 1 }, unique: true },
      { key: { customerId: 1, orderDate: -1 } },
      { key: { status: 1, orderDate: -1 } },
      { key: { orderDate: -1 } },
      { key: { totalAmount: -1 } }
    ]);

    // Reports indexes
    await this.db!.collection('reports').createIndexes([
      { key: { type: 1, generatedAt: -1 } },
      { key: { generatedBy: 1 } }
    ]);

    // Sync logs indexes
    await this.db!.collection('sync_logs').createIndexes([
      { key: { type: 1, timestamp: -1 } }
    ]);

    this.log('✅ Created indexes for all collections');
  }

  async initialize(): Promise<InitializationResult> {
    try {
      await this.connect();
      
      const userIds = await this.createUsers();
      const productIds = await this.createProducts();
      await this.createOrders(userIds, productIds);
      await this.createSystemCollections(userIds);
      await this.createIndexes();

      const collections = {
        users: await this.db!.collection('users').countDocuments(),
        products: await this.db!.collection('products').countDocuments(),
        orders: await this.db!.collection('orders').countDocuments(),
        reports: await this.db!.collection('reports').countDocuments(),
        syncLogs: await this.db!.collection('sync_logs').countDocuments()
      };

      this.log('📊 Database initialization summary:');
      this.log(`  - Users: ${collections.users}`);
      this.log(`  - Products: ${collections.products}`);
      this.log(`  - Orders: ${collections.orders}`);
      this.log(`  - Reports: ${collections.reports}`);
      this.log(`  - Sync Logs: ${collections.syncLogs}`);

      this.log('🎉 MongoREST database initialization completed successfully!');
      this.log('');
      this.log('You can now:');
      this.log('  1. Start MongoREST server');
      this.log('  2. Access API documentation at http://localhost:3000/docs');
      this.log('  3. Test CRUD operations on collections');
      this.log('  4. Execute custom functions');
      this.log('');
      this.log('Sample API calls:');
      this.log('  GET /crud/users - List all users');
      this.log('  GET /crud/products?category=electronics - Filter products');
      this.log('  POST /functions/analytics/user-report - Generate user report');

      return {
        success: true,
        message: 'Database initialization completed successfully',
        collections
      };
    } catch (error) {
      const err = error as Error;
      this.log(`❌ Error during initialization: ${err.message}`);
      throw error;
    }
  }
}

// Run if executed directly
if (require.main === module) {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mongorest';
  const dbName = process.env.MONGODB_DB_NAME || 'mongorest';
  
  const initializer = new MongoDBInitializer(mongoUri, dbName);
  
  initializer.initialize()
    .then((result) => {
      console.log('✅ Initialization result:', result);
      process.exit(0);
    })
    .catch((error: Error) => {
      console.error('❌ Initialization failed:', error);
      process.exit(1);
    });
}

export default MongoDBInitializer;
