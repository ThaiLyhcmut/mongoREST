const axios = require('axios');
require('dotenv').config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

/**
 * Test script for MongoREST Relationship System
 * Tests PostgREST-style relationship queries and filtering
 */
class RelationshipTester {
  constructor() {
    this.baseURL = API_BASE_URL;
    this.testToken = null;
    this.results = [];
  }

  async authenticate() {
    try {
      // For testing, we'll use a simple dev token
      // In production, this would be obtained through proper authentication
      this.testToken = 'Bearer ' + Buffer.from(JSON.stringify({
        sub: 'test_user_12345',
        role: 'admin',
        permissions: ['*'],
        collections: ['*'],
        functions: ['*'],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: 'mongorest',
        aud: 'mongorest-api'
      })).toString('base64');
      
      console.log('🔐 Using test authentication token');
    } catch (error) {
      console.error('❌ Authentication failed:', error.message);
      throw error;
    }
  }

  async makeRequest(method, endpoint, data = null) {
    try {
      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {}
      };

      if (this.testToken) {
        config.headers.Authorization = this.testToken;
      }

      if (data) {
        config.data = data;
        config.headers['Content-Type'] = 'application/json';
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  async testAPI(name, method, endpoint, expectedFeatures = []) {
    console.log(`\n🧪 Testing: ${name}`);
    console.log(`   ${method} ${endpoint}`);
    
    try {
      const startTime = Date.now();
      const result = await this.makeRequest(method, endpoint);
      const duration = Date.now() - startTime;
      
      // Check if response has expected features
      let featuresFound = [];
      if (expectedFeatures.includes('relationships') && result.data && Array.isArray(result.data) && result.data.length > 0) {
        const hasRelationships = Object.keys(result.data[0]).some(key => 
          typeof result.data[0][key] === 'object' && result.data[0][key] !== null
        );
        if (hasRelationships) featuresFound.push('relationships');
      }
      
      if (expectedFeatures.includes('filtering') && result.meta?.query) {
        featuresFound.push('filtering');
      }
      
      if (expectedFeatures.includes('aggregation') && result.meta?.operation === 'aggregate') {
        featuresFound.push('aggregation');
      }

      console.log(`   ✅ Success (${duration}ms)`);
      if (result.data) {
        const count = Array.isArray(result.data) ? result.data.length : 1;
        console.log(`   📊 Results: ${count} record(s)`);
      }
      if (featuresFound.length > 0) {
        console.log(`   🔗 Features: ${featuresFound.join(', ')}`);
      }
      if (result.meta?.executionTime) {
        console.log(`   ⏱️  DB Time: ${result.meta.executionTime}`);
      }

      this.results.push({
        name,
        success: true,
        duration,
        features: featuresFound,
        resultCount: Array.isArray(result.data) ? result.data.length : 1
      });

      // Show sample data for interesting results
      if (result.data && Array.isArray(result.data) && result.data.length > 0) {
        const sample = result.data[0];
        const sampleKeys = Object.keys(sample).slice(0, 5);
        console.log(`   📋 Sample: ${sampleKeys.join(', ')}${sampleKeys.length < Object.keys(sample).length ? '...' : ''}`);
      }

      return result;
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      this.results.push({
        name,
        success: false,
        error: error.message,
        duration: 0,
        features: [],
        resultCount: 0
      });
      return null;
    }
  }

  async runBasicTests() {
    console.log('\n🔄 Running Basic CRUD Tests...');
    
    // Test basic collection access
    await this.testAPI(
      'List Users', 
      'GET', 
      '/crud/users?limit=3'
    );
    
    await this.testAPI(
      'List Products', 
      'GET', 
      '/crud/products?limit=3'
    );
    
    await this.testAPI(
      'List Orders', 
      'GET', 
      '/crud/orders?limit=3'
    );
  }

  async runRelationshipTests() {
    console.log('\n🔗 Running Relationship Tests...');

    // Test belongsTo relationships
    await this.testAPI(
      'Orders with Customer (belongsTo)',
      'GET',
      '/crud/orders?select=orderNumber,totalAmount,status,customer(name,email,profile)',
      ['relationships', 'aggregation']
    );

    // Test hasMany relationships  
    await this.testAPI(
      'Users with Orders (hasMany)',
      'GET', 
      '/crud/users?select=name,email,profile,orders(orderNumber,totalAmount,status)',
      ['relationships', 'aggregation']
    );

    // Test manyToMany relationships
    await this.testAPI(
      'Products with Categories (manyToMany)',
      'GET',
      '/crud/products?select=name,price,categories:product_categories.category(name,slug)',
      ['relationships', 'aggregation']
    );

    // Test multiple relationships
    await this.testAPI(
      'Products with Categories and Reviews',
      'GET',
      '/crud/products?select=name,price,categories:product_categories.category(name),reviews(rating,title,user(name))',
      ['relationships', 'aggregation']
    );
  }

  async runFilteringTests() {
    console.log('\n🔍 Running Relationship Filtering Tests...');

    // Test filtering on direct fields
    await this.testAPI(
      'Products by Category',
      'GET',
      '/crud/products?category=eq.electronics&select=name,price,category',
      ['filtering']
    );

    // Test filtering on relationship fields
    await this.testAPI(
      'Users with Completed Orders (relationship filter)',
      'GET',
      '/crud/users?select=name,email,orders(orderNumber,status)&orders.status=eq.delivered',
      ['relationships', 'filtering', 'aggregation']
    );

    // Test complex filtering
    await this.testAPI(
      'Products with High-Rated Reviews',
      'GET',
      '/crud/products?select=name,price,reviews(rating,title)&reviews.rating=gte.4',
      ['relationships', 'filtering', 'aggregation']
    );

    // Test multiple filters
    await this.testAPI(
      'Electronics under $1000 with Reviews',
      'GET',
      '/crud/products?category=eq.electronics&price=lt.1000&select=name,price,reviews(rating,title)&reviews.rating=gte.4',
      ['relationships', 'filtering', 'aggregation']
    );
  }

  async runAdvancedTests() {
    console.log('\n🚀 Running Advanced Relationship Tests...');

    // Test nested relationships (3 levels deep)
    await this.testAPI(
      'Orders → Customer → Profile (nested)',
      'GET',
      '/crud/orders?select=orderNumber,customer(name,profile(country,interests))&limit=2',
      ['relationships', 'aggregation']
    );

    // Test aggregated relationships
    await this.testAPI(
      'Products with Review Count',
      'GET',
      '/crud/products?select=name,price,reviewCount:reviews!count&limit=3',
      ['relationships', 'aggregation']
    );

    // Test relationship with sorting and limiting
    await this.testAPI(
      'Users with Recent Orders',
      'GET',
      '/crud/users?select=name,recentOrders:orders(orderNumber,orderDate,totalAmount)!order.orderDate.desc!limit.2',
      ['relationships', 'aggregation']
    );

    // Test complex PostgREST-style query
    await this.testAPI(
      'Complex PostgREST Query',
      'GET',
      '/crud/users?select=name,email,profile(country),orders(orderNumber,totalAmount,status)&profile.country=eq.Vietnam&orders.totalAmount=gte.100',
      ['relationships', 'filtering', 'aggregation']
    );
  }

  async runErrorTests() {
    console.log('\n⚠️  Running Error Handling Tests...');

    // Test invalid relationship
    await this.testAPI(
      'Invalid Relationship',
      'GET',
      '/crud/users?select=name,invalidRelation(field)'
    );

    // Test invalid field in relationship
    await this.testAPI(
      'Invalid Field in Relationship',
      'GET',
      '/crud/users?select=name,orders(invalidField)'
    );

    // Test invalid filter operator
    await this.testAPI(
      'Invalid Filter Operator',
      'GET',
      '/crud/users?name=invalidOp.value'
    );
  }

  async runPerformanceTests() {
    console.log('\n⚡ Running Performance Tests...');

    // Test large relationship query
    await this.testAPI(
      'Large Relationship Query',
      'GET',
      '/crud/products?select=name,price,categories:product_categories.category(name),reviews(rating,title,user(name))&limit=10',
      ['relationships', 'aggregation']
    );

    // Test pagination with relationships
    await this.testAPI(
      'Paginated Relationships',
      'GET',
      '/crud/users?select=name,orders(orderNumber,totalAmount)&page=1&limit=2',
      ['relationships', 'aggregation']
    );
  }

  async testHealthCheck() {
    console.log('\n❤️  Testing API Health...');
    
    try {
      const health = await this.makeRequest('GET', '/health');
      console.log('   ✅ API is healthy');
      console.log(`   📊 Database: ${health.database?.status || 'unknown'}`);
      return true;
    } catch (error) {
      console.log('   ❌ API health check failed:', error.message);
      return false;
    }
  }

  async testAPIInfo() {
    console.log('\n📋 Getting API Information...');
    
    try {
      const info = await this.makeRequest('GET', '/');
      console.log(`   🏷️  Service: ${info.service}`);
      console.log(`   📦 Version: ${info.version}`);
      console.log(`   📚 Collections: ${info.collections?.length || 0}`);
      console.log(`   ⚙️  Functions: ${info.functions?.length || 0}`);
      
      if (info.features) {
        const features = Object.entries(info.features)
          .filter(([, enabled]) => enabled)
          .map(([feature]) => feature);
        console.log(`   🔧 Features: ${features.join(', ')}`);
      }
      
      return info;
    } catch (error) {
      console.log('   ❌ Failed to get API info:', error.message);
      return null;
    }
  }

  printSummary() {
    console.log('\n📊 Test Summary');
    console.log('='.repeat(50));
    
    const total = this.results.length;
    const passed = this.results.filter(r => r.success).length;
    const failed = total - passed;
    
    console.log(`   Total Tests: ${total}`);
    console.log(`   ✅ Passed: ${passed}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📈 Success Rate: ${Math.round((passed / total) * 100)}%`);
    
    if (passed > 0) {
      const avgDuration = Math.round(
        this.results.filter(r => r.success).reduce((sum, r) => sum + r.duration, 0) / passed
      );
      console.log(`   ⏱️  Average Response Time: ${avgDuration}ms`);
    }
    
    // Feature summary
    const featureCounts = {};
    this.results.forEach(r => {
      r.features.forEach(feature => {
        featureCounts[feature] = (featureCounts[feature] || 0) + 1;
      });
    });
    
    if (Object.keys(featureCounts).length > 0) {
      console.log('\n🔧 Feature Usage:');
      Object.entries(featureCounts).forEach(([feature, count]) => {
        console.log(`   ${feature}: ${count} test(s)`);
      });
    }
    
    // Failed tests details
    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.filter(r => !r.success).forEach(r => {
        console.log(`   • ${r.name}: ${r.error}`);
      });
    }
    
    console.log('\n' + '='.repeat(50));
  }

  async runAllTests() {
    console.log('🚀 MongoREST Relationship System Tests');
    console.log('='.repeat(50));
    
    try {
      // Setup
      await this.authenticate();
      
      // Check API health first
      const isHealthy = await this.testHealthCheck();
      if (!isHealthy) {
        console.log('⚠️  API is not healthy, continuing with limited tests...');
      }

      // Get API info
      await this.testAPIInfo();
      
      // Run test suites
      await this.runBasicTests();
      await this.runRelationshipTests();
      await this.runFilteringTests();
      await this.runAdvancedTests();
      await this.runPerformanceTests();
      await this.runErrorTests();
      
    } catch (error) {
      console.error('\n💥 Test execution failed:', error);
    } finally {
      this.printSummary();
    }
  }
}

// Helper function to run specific test
async function runSpecificTest(testName) {
  const tester = new RelationshipTester();
  
  try {
    await tester.authenticate();
    
    switch (testName) {
      case 'basic':
        await tester.runBasicTests();
        break;
      case 'relationships':
        await tester.runRelationshipTests();
        break;
      case 'filtering':
        await tester.runFilteringTests();
        break;
      case 'advanced':
        await tester.runAdvancedTests();
        break;
      case 'performance':
        await tester.runPerformanceTests();
        break;
      case 'errors':
        await tester.runErrorTests();
        break;
      default:
        console.log('Available tests: basic, relationships, filtering, advanced, performance, errors');
        return;
    }
    
    tester.printSummary();
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const testType = process.argv[2];
  
  if (testType && testType !== 'all') {
    runSpecificTest(testType);
  } else {
    const tester = new RelationshipTester();
    tester.runAllTests();
  }
}

module.exports = { RelationshipTester, runSpecificTest };
