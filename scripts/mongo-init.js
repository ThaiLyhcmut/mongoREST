// MongoDB initialization script
// This script runs when the MongoDB container starts for the first time

print('🚀 Initializing MongoREST database...');

// Switch to mongorest database
db = db.getSiblingDB('mongorest');

// Create collections with sample data
print('📄 Creating collections with sample data...');

// Users collection
db.users.insertMany([
  {
    email: 'admin@mongorest.com',
    name: 'Admin User',
    profile: {
      age: 30,
      country: 'Vietnam',
      interests: ['technology', 'databases', 'apis']
    },
    status: 'active',
    lastLogin: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    email: 'analyst@mongorest.com',
    name: 'Data Analyst',
    profile: {
      age: 28,
      country: 'Thailand',
      interests: ['analytics', 'reporting', 'data-science']
    },
    status: 'active',
    lastLogin: new Date(Date.now() - 86400000), // 1 day ago
    createdAt: new Date(Date.now() - 7 * 86400000), // 7 days ago
    updatedAt: new Date()
  },
  {
    email: 'developer@mongorest.com',
    name: 'Developer User',
    profile: {
      age: 26,
      country: 'Singapore',
      interests: ['programming', 'apis', 'mongodb']
    },
    status: 'active',
    lastLogin: new Date(Date.now() - 3600000), // 1 hour ago
    createdAt: new Date(Date.now() - 30 * 86400000), // 30 days ago
    updatedAt: new Date()
  },
  {
    email: 'user@example.com',
    name: 'Regular User',
    profile: {
      age: 25,
      country: 'Malaysia',
      interests: ['shopping', 'technology']
    },
    status: 'active',
    lastLogin: new Date(Date.now() - 2 * 86400000), // 2 days ago
    createdAt: new Date(Date.now() - 60 * 86400000), // 60 days ago
    updatedAt: new Date()
  }
]);

print('✅ Created users collection with 4 documents');

// Products collection
db.products.insertMany([
  {
    sku: 'LAPTOP-001',
    name: 'MacBook Pro 16-inch',
    description: 'Apple MacBook Pro with M2 chip, perfect for developers',
    category: 'electronics',
    subcategory: 'laptops',
    price: 2499.99,
    currency: 'USD',
    inventory: {
      quantity: 50,
      reserved: 5,
      lowStockThreshold: 10
    },
    images: [
      'https://example.com/images/macbook-1.jpg',
      'https://example.com/images/macbook-2.jpg'
    ],
    tags: ['apple', 'laptop', 'developer', 'premium'],
    specifications: {
      processor: 'Apple M2',
      memory: '16GB',
      storage: '512GB SSD',
      display: '16-inch Retina'
    },
    ratings: {
      average: 4.8,
      count: 245
    },
    status: 'active',
    createdAt: new Date(Date.now() - 90 * 86400000),
    updatedAt: new Date()
  },
  {
    sku: 'PHONE-002',
    name: 'iPhone 15 Pro',
    description: 'Latest iPhone with advanced camera system',
    category: 'electronics',
    subcategory: 'smartphones',
    price: 999.99,
    currency: 'USD',
    inventory: {
      quantity: 100,
      reserved: 15,
      lowStockThreshold: 20
    },
    images: [
      'https://example.com/images/iphone-1.jpg'
    ],
    tags: ['apple', 'smartphone', 'camera', '5g'],
    specifications: {
      processor: 'A17 Pro',
      memory: '128GB',
      display: '6.1-inch Super Retina XDR',
      camera: '48MP Main'
    },
    ratings: {
      average: 4.6,
      count: 892
    },
    status: 'active',
    createdAt: new Date(Date.now() - 60 * 86400000),
    updatedAt: new Date()
  },
  {
    sku: 'BOOK-003',
    name: 'MongoDB: The Definitive Guide',
    description: 'Comprehensive guide to MongoDB database',
    category: 'books',
    subcategory: 'technical',
    price: 49.99,
    currency: 'USD',
    inventory: {
      quantity: 200,
      reserved: 0,
      lowStockThreshold: 50
    },
    images: [
      'https://example.com/images/mongodb-book.jpg'
    ],
    tags: ['mongodb', 'database', 'technical', 'programming'],
    specifications: {
      pages: 512,
      publisher: "O'Reilly",
      isbn: '978-1491954461'
    },
    ratings: {
      average: 4.4,
      count: 156
    },
    status: 'active',
    createdAt: new Date(Date.now() - 120 * 86400000),
    updatedAt: new Date()
  }
]);

print('✅ Created products collection with 3 documents');

// Orders collection (with references to users and products)
const users = db.users.find().toArray();
const products = db.products.find().toArray();

db.orders.insertMany([
  {
    orderNumber: 'ORD-20241201',
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
      address: '123 Tech Street',
      city: 'Ho Chi Minh City',
      country: 'Vietnam',
      phone: '+84123456789'
    },
    billingAddress: {
      fullName: users[0].name,
      address: '123 Tech Street',
      city: 'Ho Chi Minh City',
      country: 'Vietnam'
    },
    payment: {
      method: 'credit_card',
      status: 'completed',
      transactionId: 'txn_123456789',
      amount: products[0].price
    },
    subtotal: products[0].price,
    tax: products[0].price * 0.1,
    shipping: 25.00,
    discount: 0,
    totalAmount: products[0].price + (products[0].price * 0.1) + 25.00,
    currency: 'USD',
    status: 'delivered',
    orderDate: new Date(Date.now() - 7 * 86400000),
    shippedDate: new Date(Date.now() - 5 * 86400000),
    deliveredDate: new Date(Date.now() - 3 * 86400000),
    createdAt: new Date(Date.now() - 7 * 86400000),
    updatedAt: new Date()
  },
  {
    orderNumber: 'ORD-20241202',
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
      address: '456 Data Avenue',
      city: 'Bangkok',
      country: 'Thailand',
      phone: '+66123456789'
    },
    billingAddress: {
      fullName: users[1].name,
      address: '456 Data Avenue',
      city: 'Bangkok',
      country: 'Thailand'
    },
    payment: {
      method: 'paypal',
      status: 'completed',
      transactionId: 'txn_987654321',
      amount: products[1].price + (products[2].price * 2)
    },
    subtotal: products[1].price + (products[2].price * 2),
    tax: (products[1].price + (products[2].price * 2)) * 0.08,
    shipping: 15.00,
    discount: 50.00,
    totalAmount: (products[1].price + (products[2].price * 2)) + ((products[1].price + (products[2].price * 2)) * 0.08) + 15.00 - 50.00,
    currency: 'USD',
    status: 'shipped',
    orderDate: new Date(Date.now() - 3 * 86400000),
    shippedDate: new Date(Date.now() - 1 * 86400000),
    createdAt: new Date(Date.now() - 3 * 86400000),
    updatedAt: new Date()
  }
]);

print('✅ Created orders collection with 2 documents');

// Create additional collections for system functionality
db.reports.insertMany([
  {
    type: 'userAnalytics',
    reportId: 'report_001',
    generatedAt: new Date(Date.now() - 86400000),
    generatedBy: users[0]._id,
    parameters: {
      dateRange: {
        start: '2024-11-01',
        end: '2024-11-30'
      },
      segments: ['country']
    },
    data: {
      summary: {
        totalUsers: 4,
        activeUsers: 4,
        newUsers: 2
      }
    },
    status: 'completed'
  }
]);

db.sync_logs.insertMany([
  {
    type: 'crm_user_sync',
    timestamp: new Date(Date.now() - 3600000),
    syncId: 'sync_001',
    usersProcessed: 4,
    success: true,
    executedBy: users[0]._id,
    dryRun: false
  }
]);

print('✅ Created system collections');

// Create indexes for better performance
print('📋 Creating indexes...');

// Users indexes
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ createdAt: -1 });
db.users.createIndex({ 'profile.country': 1, status: 1 });
db.users.createIndex({ name: 'text', email: 'text' });

// Products indexes
db.products.createIndex({ sku: 1 }, { unique: true });
db.products.createIndex({ category: 1, status: 1 });
db.products.createIndex({ name: 'text', description: 'text', tags: 'text' });
db.products.createIndex({ price: 1 });
db.products.createIndex({ createdAt: -1 });

// Orders indexes
db.orders.createIndex({ orderNumber: 1 }, { unique: true });
db.orders.createIndex({ customerId: 1, orderDate: -1 });
db.orders.createIndex({ status: 1, orderDate: -1 });
db.orders.createIndex({ orderDate: -1 });
db.orders.createIndex({ totalAmount: -1 });

// Reports indexes
db.reports.createIndex({ type: 1, generatedAt: -1 });
db.reports.createIndex({ generatedBy: 1 });

// Sync logs indexes
db.sync_logs.createIndex({ type: 1, timestamp: -1 });

print('✅ Created indexes for all collections');

// Create a user for MongoREST application
db.createUser({
  user: 'mongorest',
  pwd: 'mongorest-password',
  roles: [
    {
      role: 'readWrite',
      db: 'mongorest'
    }
  ]
});

print('✅ Created application user');

// Display summary
print('📊 Database initialization summary:');
print(`  - Users: ${db.users.countDocuments()}`);
print(`  - Products: ${db.products.countDocuments()}`);
print(`  - Orders: ${db.orders.countDocuments()}`);
print(`  - Reports: ${db.reports.countDocuments()}`);
print(`  - Sync Logs: ${db.sync_logs.countDocuments()}`);

print('🎉 MongoREST database initialization completed successfully!');
print('');
print('You can now:');
print('  1. Start MongoREST server');
print('  2. Access API documentation at http://localhost:3000/docs');
print('  3. Test CRUD operations on collections');
print('  4. Execute custom functions');
print('');
print('Sample API calls:');
print('  GET /crud/users - List all users');
print('  GET /crud/products?category=electronics - Filter products');
print('  POST /functions/analytics/user-report - Generate user report');
