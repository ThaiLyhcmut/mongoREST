import { MongoClient, ObjectId, Db, Collection } from 'mongodb';
import * as dotenv from 'dotenv';
import { 
  SampleDataUser, 
  SampleDataProduct, 
  SampleDataOrder,
  DatabaseConnection
} from './types';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mongorest';

/**
 * Sample data generator for testing relationship system
 */
class SampleDataGenerator {
  private client: MongoClient | null = null;
  private db: Db | null = null;

  async connect(): Promise<void> {
    this.client = new MongoClient(MONGODB_URI);
    await this.client.connect();
    this.db = this.client.db();
    console.log('Connected to MongoDB');
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      console.log('Disconnected from MongoDB');
    }
  }

  async clearCollections(): Promise<void> {
    const collections = [
      'users', 'products', 'orders', 'categories', 
      'product_categories', 'product_reviews'
    ];

    for (const collectionName of collections) {
      try {
        await this.db!.collection(collectionName).deleteMany({});
        console.log(`✅ Cleared collection: ${collectionName}`);
      } catch (error) {
        console.log(`⚠️  Collection ${collectionName} doesn't exist, skipping...`);
      }
    }
  }

  async generateUsers(): Promise<SampleDataUser[]> {
    const users: SampleDataUser[] = [
      {
        _id: new ObjectId('507f1f77bcf86cd799439011'),
        email: 'john.doe@example.com',
        name: 'John Doe',
        profile: {
          age: 30,
          country: 'Vietnam',
          interests: ['technology', 'gaming', 'travel'],
          avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400'
        },
        status: 'active',
        lastLogin: '2024-01-15T10:30:00.000Z',
        createdAt: '2023-01-15T10:30:00.000Z',
        updatedAt: '2024-01-15T10:30:00.000Z'
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439012'),
        email: 'jane.smith@example.com',
        name: 'Jane Smith',
        profile: {
          age: 28,
          country: 'Thailand',
          interests: ['design', 'photography', 'cooking'],
          avatar: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=400'
        },
        status: 'active',
        lastLogin: '2024-01-14T15:20:00.000Z',
        createdAt: '2023-02-10T08:15:00.000Z',
        updatedAt: '2024-01-14T15:20:00.000Z'
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439013'),
        email: 'mike.wilson@example.com',
        name: 'Mike Wilson',
        profile: {
          age: 35,
          country: 'Malaysia',
          interests: ['fitness', 'music', 'movies'],
          avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400'
        },
        status: 'active',
        lastLogin: '2024-01-13T12:45:00.000Z',
        createdAt: '2023-03-20T14:30:00.000Z',
        updatedAt: '2024-01-13T12:45:00.000Z'
      }
    ];

    await this.db!.collection('users').insertMany(users);
    console.log(`✅ Generated ${users.length} users`);
    return users;
  }

  async generateCategories(): Promise<any[]> {
    const categories = [
      {
        _id: new ObjectId('507f1f77bcf86cd799439021'),
        name: 'Electronics',
        slug: 'electronics',
        description: 'Electronic devices and gadgets',
        image: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=600',
        sortOrder: 1,
        featured: true,
        status: 'active',
        seo: {
          metaTitle: 'Electronics - Latest Gadgets and Devices',
          metaDescription: 'Shop the latest electronics, gadgets, and devices',
          keywords: ['electronics', 'gadgets', 'devices', 'tech']
        },
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439022'),
        name: 'Clothing',
        slug: 'clothing',
        description: 'Fashion and apparel',
        image: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600',
        sortOrder: 2,
        featured: true,
        status: 'active',
        seo: {
          metaTitle: 'Clothing - Fashion and Apparel',
          metaDescription: 'Discover the latest fashion trends and clothing',
          keywords: ['clothing', 'fashion', 'apparel', 'style']
        },
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439023'),
        name: 'Books',
        slug: 'books',
        description: 'Books and literature',
        image: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600',
        sortOrder: 3,
        featured: false,
        status: 'active',
        seo: {
          metaTitle: 'Books - Literature and Educational',
          metaDescription: 'Browse our collection of books and literature',
          keywords: ['books', 'literature', 'reading', 'education']
        },
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      }
    ];

    await this.db!.collection('categories').insertMany(categories);
    console.log(`✅ Generated ${categories.length} categories`);
    return categories;
  }

  async generateProducts(): Promise<SampleDataProduct[]> {
    const products: SampleDataProduct[] = [
      {
        _id: new ObjectId('507f1f77bcf86cd799439031'),
        sku: 'LAPTOP-001',
        name: 'MacBook Pro 16"',
        description: 'Powerful laptop for professionals',
        category: 'electronics',
        subcategory: 'laptops',
        price: 2399.99,
        currency: 'USD',
        inventory: {
          quantity: 15,
          reserved: 2,
          lowStockThreshold: 5
        },
        images: [
          'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600',
          'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=600'
        ],
        tags: ['laptop', 'apple', 'macbook', 'professional', 'computer'],
        specifications: {
          brand: 'Apple',
          processor: 'M2 Pro',
          memory: '16GB',
          storage: '512GB SSD',
          screen: '16 inch Retina',
          weight: '2.15 kg'
        },
        ratings: {
          average: 4.8,
          count: 127
        },
        status: 'active',
        createdAt: '2023-01-10T00:00:00.000Z',
        updatedAt: '2024-01-10T00:00:00.000Z'
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439032'),
        sku: 'PHONE-001',
        name: 'iPhone 15 Pro',
        description: 'Latest iPhone with advanced features',
        category: 'electronics',
        subcategory: 'smartphones',
        price: 999.99,
        currency: 'USD',
        inventory: {
          quantity: 25,
          reserved: 5,
          lowStockThreshold: 10
        },
        images: [
          'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=600',
          'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600'
        ],
        tags: ['smartphone', 'apple', 'iphone', 'mobile', 'communication'],
        specifications: {
          brand: 'Apple',
          processor: 'A17 Pro',
          memory: '128GB',
          camera: '48MP Pro',
          display: '6.1 inch Super Retina XDR',
          battery: '3274 mAh'
        },
        ratings: {
          average: 4.6,
          count: 89
        },
        status: 'active',
        createdAt: '2023-06-15T00:00:00.000Z',
        updatedAt: '2024-01-15T00:00:00.000Z'
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439033'),
        sku: 'SHIRT-001',
        name: 'Cotton T-Shirt',
        description: 'Comfortable cotton t-shirt',
        category: 'clothing',
        subcategory: 'shirts',
        price: 29.99,
        currency: 'USD',
        inventory: {
          quantity: 100,
          reserved: 10,
          lowStockThreshold: 20
        },
        images: [
          'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600',
          'https://images.unsplash.com/photo-1562157873-818bc0726f68?w=600'
        ],
        tags: ['shirt', 'cotton', 'casual', 'clothing', 'comfortable'],
        specifications: {
          material: '100% Cotton',
          sizes: ['S', 'M', 'L', 'XL'],
          colors: ['White', 'Black', 'Blue', 'Gray'],
          care: 'Machine washable'
        },
        ratings: {
          average: 4.2,
          count: 45
        },
        status: 'active',
        createdAt: '2023-03-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439034'),
        sku: 'BOOK-001',
        name: 'JavaScript: The Good Parts',
        description: 'Essential JavaScript programming guide',
        category: 'books',
        subcategory: 'programming',
        price: 39.99,
        currency: 'USD',
        inventory: {
          quantity: 50,
          reserved: 3,
          lowStockThreshold: 10
        },
        images: [
          'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600'
        ],
        tags: ['book', 'javascript', 'programming', 'development', 'education'],
        specifications: {
          author: 'Douglas Crockford',
          publisher: "O'Reilly Media",
          pages: 172,
          isbn: '978-0596517748',
          language: 'English',
          format: 'Paperback'
        },
        ratings: {
          average: 4.4,
          count: 312
        },
        status: 'active',
        createdAt: '2023-02-20T00:00:00.000Z',
        updatedAt: '2023-12-20T00:00:00.000Z'
      }
    ];

    await this.db!.collection('products').insertMany(products);
    console.log(`✅ Generated ${products.length} products`);
    return products;
  }

  async generateProductCategories(): Promise<any[]> {
    const productCategories = [
      {
        _id: new ObjectId('507f1f77bcf86cd799439041'),
        productId: new ObjectId('507f1f77bcf86cd799439031'), // MacBook Pro
        categoryId: new ObjectId('507f1f77bcf86cd799439021'), // Electronics
        isPrimary: true,
        sortOrder: 1,
        createdAt: '2023-01-10T00:00:00.000Z'
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439042'),
        productId: new ObjectId('507f1f77bcf86cd799439032'), // iPhone 15 Pro
        categoryId: new ObjectId('507f1f77bcf86cd799439021'), // Electronics
        isPrimary: true,
        sortOrder: 2,
        createdAt: '2023-06-15T00:00:00.000Z'
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439043'),
        productId: new ObjectId('507f1f77bcf86cd799439033'), // Cotton T-Shirt
        categoryId: new ObjectId('507f1f77bcf86cd799439022'), // Clothing
        isPrimary: true,
        sortOrder: 1,
        createdAt: '2023-03-01T00:00:00.000Z'
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439044'),
        productId: new ObjectId('507f1f77bcf86cd799439034'), // JavaScript Book
        categoryId: new ObjectId('507f1f77bcf86cd799439023'), // Books
        isPrimary: true,
        sortOrder: 1,
        createdAt: '2023-02-20T00:00:00.000Z'
      }
    ];

    await this.db!.collection('product_categories').insertMany(productCategories);
    console.log(`✅ Generated ${productCategories.length} product-category relationships`);
    return productCategories;
  }

  async generateProductReviews(): Promise<any[]> {
    const reviews = [
      {
        _id: new ObjectId('507f1f77bcf86cd799439051'),
        productId: new ObjectId('507f1f77bcf86cd799439031'), // MacBook Pro
        userId: new ObjectId('507f1f77bcf86cd799439011'), // John Doe
        rating: 5,
        title: 'Excellent laptop for development',
        content: 'This MacBook Pro is amazing for software development. The M2 Pro chip is incredibly fast and the battery life is outstanding. Highly recommended for professionals.',
        verified: true,
        helpful: { yes: 15, no: 2 },
        status: 'approved',
        images: [
          'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400'
        ],
        createdAt: '2023-02-01T10:30:00.000Z',
        updatedAt: '2023-02-01T10:30:00.000Z'
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439052'),
        productId: new ObjectId('507f1f77bcf86cd799439031'), // MacBook Pro
        userId: new ObjectId('507f1f77bcf86cd799439012'), // Jane Smith
        rating: 4,
        title: 'Great performance but expensive',
        content: 'The performance is excellent and the build quality is top-notch. However, it is quite expensive. Worth it if you need the power for professional work.',
        verified: true,
        helpful: { yes: 8, no: 1 },
        status: 'approved',
        createdAt: '2023-03-15T14:20:00.000Z',
        updatedAt: '2023-03-15T14:20:00.000Z'
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439053'),
        productId: new ObjectId('507f1f77bcf86cd799439032'), // iPhone 15 Pro
        userId: new ObjectId('507f1f77bcf86cd799439013'), // Mike Wilson
        rating: 5,
        title: 'Best iPhone yet',
        content: 'The camera quality is incredible and the new titanium design feels premium. The A17 Pro chip handles everything smoothly. Very satisfied with this purchase.',
        verified: true,
        helpful: { yes: 22, no: 0 },
        status: 'approved',
        createdAt: '2023-07-10T09:15:00.000Z',
        updatedAt: '2023-07-10T09:15:00.000Z'
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439054'),
        productId: new ObjectId('507f1f77bcf86cd799439033'), // Cotton T-Shirt
        userId: new ObjectId('507f1f77bcf86cd799439011'), // John Doe
        rating: 4,
        title: 'Comfortable and good quality',
        content: 'The cotton material is soft and comfortable. Good fit and the color has not faded after multiple washes. Good value for money.',
        verified: true,
        helpful: { yes: 5, no: 0 },
        status: 'approved',
        createdAt: '2023-04-05T16:45:00.000Z',
        updatedAt: '2023-04-05T16:45:00.000Z'
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439055'),
        productId: new ObjectId('507f1f77bcf86cd799439034'), // JavaScript Book
        userId: new ObjectId('507f1f77bcf86cd799439012'), // Jane Smith
        rating: 5,
        title: 'Essential for JavaScript developers',
        content: 'This book is a must-read for anyone serious about JavaScript. Douglas Crockford explains the language beautifully and helps you avoid common pitfalls. Concise and well-written.',
        verified: true,
        helpful: { yes: 42, no: 3 },
        status: 'approved',
        createdAt: '2023-05-20T11:30:00.000Z',
        updatedAt: '2023-05-20T11:30:00.000Z'
      }
    ];

    await this.db!.collection('product_reviews').insertMany(reviews);
    console.log(`✅ Generated ${reviews.length} product reviews`);
    return reviews;
  }

  async generateOrders(): Promise<SampleDataOrder[]> {
    const orders: SampleDataOrder[] = [
      {
        _id: new ObjectId('507f1f77bcf86cd799439061'),
        orderNumber: 'ORD-20230201',
        customerId: new ObjectId('507f1f77bcf86cd799439011'), // John Doe
        items: [
          {
            productId: new ObjectId('507f1f77bcf86cd799439031'), // MacBook Pro
            sku: 'LAPTOP-001',
            name: 'MacBook Pro 16"',
            price: 2399.99,
            quantity: 1,
            subtotal: 2399.99
          },
          {
            productId: new ObjectId('507f1f77bcf86cd799439033'), // Cotton T-Shirt
            sku: 'SHIRT-001',
            name: 'Cotton T-Shirt',
            price: 29.99,
            quantity: 2,
            subtotal: 59.98
          }
        ],
        shippingAddress: {
          fullName: 'John Doe',
          address: '123 Tech Street',
          city: 'Ho Chi Minh City',
          state: 'Ho Chi Minh',
          zipCode: '70000',
          country: 'Vietnam',
          phone: '+84 901 234 567'
        },
        billingAddress: {
          fullName: 'John Doe',
          address: '123 Tech Street',
          city: 'Ho Chi Minh City',
          state: 'Ho Chi Minh',
          zipCode: '70000',
          country: 'Vietnam'
        },
        payment: {
          method: 'credit_card',
          status: 'completed',
          transactionId: 'TXN-20230201-001',
          amount: 2459.97
        },
        subtotal: 2459.97,
        tax: 0,
        shipping: 0,
        discount: 0,
        totalAmount: 2459.97,
        currency: 'USD',
        status: 'delivered',
        orderDate: '2023-02-01T10:30:00.000Z',
        shippedDate: '2023-02-02T14:20:00.000Z',
        deliveredDate: '2023-02-05T16:45:00.000Z',
        notes: 'Express delivery requested',
        createdAt: '2023-02-01T10:30:00.000Z',
        updatedAt: '2023-02-05T16:45:00.000Z'
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439062'),
        orderNumber: 'ORD-20230715',
        customerId: new ObjectId('507f1f77bcf86cd799439013'), // Mike Wilson
        items: [
          {
            productId: new ObjectId('507f1f77bcf86cd799439032'), // iPhone 15 Pro
            sku: 'PHONE-001',
            name: 'iPhone 15 Pro',
            price: 999.99,
            quantity: 1,
            subtotal: 999.99
          }
        ],
        shippingAddress: {
          fullName: 'Mike Wilson',
          address: '456 Mobile Ave',
          city: 'Kuala Lumpur',
          state: 'Federal Territory',
          zipCode: '50000',
          country: 'Malaysia',
          phone: '+60 12 345 6789'
        },
        billingAddress: {
          fullName: 'Mike Wilson',
          address: '456 Mobile Ave',
          city: 'Kuala Lumpur',
          state: 'Federal Territory',
          zipCode: '50000',
          country: 'Malaysia'
        },
        payment: {
          method: 'paypal',
          status: 'completed',
          transactionId: 'PAY-20230715-001',
          amount: 999.99
        },
        subtotal: 999.99,
        tax: 0,
        shipping: 0,
        discount: 0,
        totalAmount: 999.99,
        currency: 'USD',
        status: 'delivered',
        orderDate: '2023-07-15T09:15:00.000Z',
        shippedDate: '2023-07-16T11:30:00.000Z',
        deliveredDate: '2023-07-18T14:20:00.000Z',
        createdAt: '2023-07-15T09:15:00.000Z',
        updatedAt: '2023-07-18T14:20:00.000Z'
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439063'),
        orderNumber: 'ORD-20230520',
        customerId: new ObjectId('507f1f77bcf86cd799439012'), // Jane Smith
        items: [
          {
            productId: new ObjectId('507f1f77bcf86cd799439034'), // JavaScript Book
            sku: 'BOOK-001',
            name: 'JavaScript: The Good Parts',
            price: 39.99,
            quantity: 1,
            subtotal: 39.99
          },
          {
            productId: new ObjectId('507f1f77bcf86cd799439033'), // Cotton T-Shirt
            sku: 'SHIRT-001',
            name: 'Cotton T-Shirt',
            price: 29.99,
            quantity: 3,
            subtotal: 89.97
          }
        ],
        shippingAddress: {
          fullName: 'Jane Smith',
          address: '789 Design Road',
          city: 'Bangkok',
          state: 'Bangkok',
          zipCode: '10400',
          country: 'Thailand',
          phone: '+66 2 123 4567'
        },
        billingAddress: {
          fullName: 'Jane Smith',
          address: '789 Design Road',
          city: 'Bangkok',
          state: 'Bangkok',
          zipCode: '10400',
          country: 'Thailand'
        },
        payment: {
          method: 'bank_transfer',
          status: 'completed',
          transactionId: 'BANK-20230520-001',
          amount: 129.96
        },
        subtotal: 129.96,
        tax: 0,
        shipping: 0,
        discount: 0,
        totalAmount: 129.96,
        currency: 'USD',
        status: 'completed',
        orderDate: '2023-05-20T11:30:00.000Z',
        shippedDate: '2023-05-21T08:45:00.000Z',
        deliveredDate: '2023-05-23T15:30:00.000Z',
        createdAt: '2023-05-20T11:30:00.000Z',
        updatedAt: '2023-05-23T15:30:00.000Z'
      }
    ];

    await this.db!.collection('orders').insertMany(orders);
    console.log(`✅ Generated ${orders.length} orders`);
    return orders;
  }

  async createIndexes(): Promise<void> {
    console.log('Creating indexes...');
    
    if (!this.db) {
      throw new Error('Database connection not established');
    }
    
    // Users indexes
    await this.db.collection('users').createIndexes([
      { key: { email: 1 }, unique: true },
      { key: { createdAt: -1 } },
      { key: { 'profile.country': 1, status: 1 } },
      { key: { name: 'text', email: 'text' } }
    ]);

    // Products indexes
    await this.db.collection('products').createIndexes([
      { key: { sku: 1 }, unique: true },
      { key: { category: 1, status: 1 } },
      { key: { name: 'text', description: 'text', tags: 'text' } },
      { key: { price: 1 } },
      { key: { createdAt: -1 } }
    ]);

    // Orders indexes
    await this.db.collection('orders').createIndexes([
      { key: { orderNumber: 1 }, unique: true },
      { key: { customerId: 1, orderDate: -1 } },
      { key: { status: 1, orderDate: -1 } },
      { key: { orderDate: -1 } },
      { key: { totalAmount: -1 } }
    ]);

    // Categories indexes
    await this.db.collection('categories').createIndexes([
      { key: { slug: 1 }, unique: true },
      { key: { name: 1 } },
      { key: { parentId: 1 } },
      { key: { status: 1, sortOrder: 1 } }
    ]);

    // Product Categories indexes
    await this.db.collection('product_categories').createIndexes([
      { key: { productId: 1, categoryId: 1 }, unique: true },
      { key: { categoryId: 1 } },
      { key: { productId: 1 } },
      { key: { isPrimary: 1 } }
    ]);

    // Product Reviews indexes
    await this.db.collection('product_reviews').createIndexes([
      { key: { productId: 1, createdAt: -1 } },
      { key: { userId: 1, createdAt: -1 } },
      { key: { rating: -1 } },
      { key: { status: 1, createdAt: -1 } },
      { key: { productId: 1, userId: 1 }, unique: true }
    ]);

    console.log('✅ Created all indexes');
  }

  async generateAll(): Promise<void> {
    console.log('🚀 Starting sample data generation...\n');

    try {
      await this.connect();
      await this.clearCollections();
      
      console.log('\n📝 Generating sample data...');
      const users = await this.generateUsers();
      const categories = await this.generateCategories();
      const products = await this.generateProducts();
      const productCategories = await this.generateProductCategories();
      const reviews = await this.generateProductReviews();
      const orders = await this.generateOrders();
      
      console.log('\n🔗 Creating indexes...');
      await this.createIndexes();
      
      console.log('\n✅ Sample data generation completed!');
      console.log('\n📊 Summary:');
      console.log(`   Users: ${users.length}`);
      console.log(`   Categories: ${categories.length}`);
      console.log(`   Products: ${products.length}`);
      console.log(`   Product-Category Relations: ${productCategories.length}`);
      console.log(`   Reviews: ${reviews.length}`);
      console.log(`   Orders: ${orders.length}`);
      
      console.log('\n🧪 Test the relationships with these example queries:');
      console.log('   GET /crud/users?select=name,email,orders(orderNumber,totalAmount,status)');
      console.log('   GET /crud/orders?select=orderNumber,totalAmount,customer(name,email),items');
      console.log('   GET /crud/products?select=name,price,categories:product_categories.category(name,slug)');
      console.log('   GET /crud/products?select=name,price,reviews(rating,title,user(name))');
      console.log('   GET /crud/users?select=name,orders(orderNumber)&orders.status=eq.delivered');
      
    } catch (error) {
      console.error('❌ Error generating sample data:', error);
      throw error;
    } finally {
      await this.disconnect();
    }
  }
}

// Run if executed directly
if (require.main === module) {
  const generator = new SampleDataGenerator();
  generator.generateAll()
    .then(() => {
      console.log('\n🎉 Sample data generation completed successfully!');
      process.exit(0);
    })
    .catch((error: Error) => {
      console.error('\n💥 Sample data generation failed:', error);
      process.exit(1);
    });
}

export default SampleDataGenerator;
