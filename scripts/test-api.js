#!/usr/bin/env node

/**
 * MongoREST API Test Suite
 * Demonstrates all features including MongoDB script execution
 */

const fetch = require('node-fetch');

class MongoRESTTester {
  constructor(baseUrl = 'http://localhost:3000', token = null) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  }

  async testHealthCheck() {
    console.log('\\n🏥 Testing Health Check...');
    
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      const data = await response.json();
      
      console.log('✅ Health Status:', data.status);
      console.log('   Uptime:', Math.floor(data.uptime), 'seconds');
      
      return true;
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      return false;
    }
  }

  async testServiceInfo() {
    console.log('\\n📋 Testing Service Information...');
    
    try {
      const response = await fetch(`${this.baseUrl}/`);
      const data = await response.json();
      
      console.log('✅ Service:', data.service);
      console.log('   Collections:', data.collections.length);
      console.log('   Functions:', data.functions.length);
      console.log('   Endpoints:', Object.keys(data.endpoints).join(', '));
      
      if (data.features) {
        console.log('   Features:');
        Object.entries(data.features).forEach(([key, value]) => {
          console.log(`     ${key}: ${value}`);
        });
      }
      
      return true;
    } catch (error) {
      console.error('❌ Service info failed:', error.message);
      return false;
    }
  }

  async testCRUDOperations() {
    console.log('\\n📊 Testing CRUD Operations...');
    
    try {
      // Create a user
      console.log('   Creating user...');
      const createResponse = await fetch(`${this.baseUrl}/crud/users`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          name: 'John Doe',
          email: 'john.doe@example.com',
          profile: {
            age: 30,
            country: 'Vietnam',
            interests: ['technology', 'travel']
          }
        })
      });
      
      if (createResponse.ok) {
        const createData = await createResponse.json();
        console.log('✅ User created:', createData.data._id);
        
        const userId = createData.data._id;
        
        // List users
        console.log('   Listing users...');
        const listResponse = await fetch(`${this.baseUrl}/crud/users?limit=5`, {
          headers: this.headers
        });
        
        if (listResponse.ok) {
          const listData = await listResponse.json();
          console.log('✅ Users listed:', listData.data.length, 'users');
        }
        
        // Update user
        console.log('   Updating user...');
        const updateResponse = await fetch(`${this.baseUrl}/crud/users/${userId}`, {
          method: 'PATCH',
          headers: this.headers,
          body: JSON.stringify({
            'profile.age': 31
          })
        });
        
        if (updateResponse.ok) {
          console.log('✅ User updated');
        }
        
        return true;
      } else {
        console.log('❌ CRUD operations failed:', createResponse.status);
        return false;
      }
    } catch (error) {
      console.error('❌ CRUD operations failed:', error.message);
      return false;
    }
  }

  async testScriptExecution() {
    console.log('\\n🔧 Testing MongoDB Script Execution...');
    
    try {
      // Test simple find script
      console.log('   Testing simple find script...');
      const findScript = 'db.users.find({status: {$ne: "deleted"}}).limit(3)';
      
      const scriptResponse = await fetch(`${this.baseUrl}/scripts/execute`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          script: findScript
        })
      });
      
      if (scriptResponse.ok) {
        const scriptData = await scriptResponse.json();
        console.log('✅ Script executed successfully');
        console.log('   Operation:', scriptData.meta.operation);
        console.log('   Collection:', scriptData.meta.collection);
        console.log('   Execution time:', scriptData.meta.executionTime);
        console.log('   Complexity:', scriptData.script.complexity);
      }
      
      // Test aggregation script
      console.log('   Testing aggregation script...');
      const aggScript = `db.users.aggregate([
        {$match: {"profile.country": "Vietnam"}},
        {$group: {_id: "$profile.country", count: {$sum: 1}}},
        {$sort: {count: -1}}
      ])`;
      
      const aggResponse = await fetch(`${this.baseUrl}/scripts/execute`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          script: aggScript
        })
      });
      
      if (aggResponse.ok) {
        const aggData = await aggResponse.json();
        console.log('✅ Aggregation script executed');
        console.log('   Complexity:', aggData.script.complexity);
      }
      
      // Test script validation
      console.log('   Testing script validation...');
      const validateResponse = await fetch(`${this.baseUrl}/scripts/validate`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          script: 'db.users.updateMany({}, {$set: {lastValidated: new Date()}})'
        })
      });
      
      if (validateResponse.ok) {
        const validateData = await validateResponse.json();
        console.log('✅ Script validation:', validateData.valid ? 'Valid' : 'Invalid');
        
        if (validateData.warnings && validateData.warnings.length > 0) {
          console.log('   Warnings:', validateData.warnings.join(', '));
        }
      }
      
      return true;
    } catch (error) {
      console.error('❌ Script execution failed:', error.message);
      return false;
    }
  }

  async testBatchOperations() {
    console.log('\\n📦 Testing Batch Operations...');
    
    try {
      const batchScripts = [
        {
          id: 'count_users',
          script: 'db.users.countDocuments({status: "active"})'
        },
        {
          id: 'count_products',
          script: 'db.products.countDocuments({status: "active"})'
        },
        {
          id: 'recent_orders',
          script: 'db.orders.find({orderDate: {$gte: new Date("2024-01-01")}}).limit(2)'
        }
      ];
      
      const batchResponse = await fetch(`${this.baseUrl}/scripts/batch`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          scripts: batchScripts,
          options: {
            stopOnError: false
          }
        })
      });
      
      if (batchResponse.ok) {
        const batchData = await batchResponse.json();
        console.log('✅ Batch execution completed');
        console.log('   Total scripts:', batchData.meta.totalScripts);
        console.log('   Successful:', batchData.meta.successCount);
        console.log('   Failed:', batchData.meta.failureCount);
        
        batchData.results.forEach(result => {
          const status = result.success ? '✅' : '❌';
          console.log(`   ${status} ${result.id}`);
        });
      }
      
      return true;
    } catch (error) {
      console.error('❌ Batch operations failed:', error.message);
      return false;
    }
  }

  async testFunctionExecution() {
    console.log('\\n⚙️ Testing Function Execution...');
    
    try {
      // List available functions
      const functionsResponse = await fetch(`${this.baseUrl}/functions`, {
        headers: this.headers
      });
      
      if (functionsResponse.ok) {
        const functionsData = await functionsResponse.json();
        console.log('✅ Available functions:', functionsData.functions.length);
        
        if (functionsData.functions.length > 0) {
          const firstFunction = functionsData.functions[0];
          console.log('   First function:', firstFunction.name);
          console.log('   Description:', firstFunction.description);
          console.log('   Steps:', firstFunction.steps);
        }
      }
      
      return true;
    } catch (error) {
      console.error('❌ Function execution failed:', error.message);
      return false;
    }
  }

  async testComplexScenarios() {
    console.log('\\n🎭 Testing Complex Scenarios...');
    
    try {
      // Test script with CRUD operation mixed
      console.log('   Testing mixed operations...');
      
      // Create a product via script
      const createProductScript = `db.products.insertOne({
        sku: "TEST-${Date.now()}",
        name: "Test Product",
        category: "electronics",
        price: 99.99,
        inventory: {quantity: 100},
        createdAt: new Date()
      })`;
      
      const createResponse = await fetch(`${this.baseUrl}/scripts/execute`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ script: createProductScript })
      });
      
      if (createResponse.ok) {
        console.log('✅ Product created via script');
        
        // Then query it via REST API
        const listResponse = await fetch(`${this.baseUrl}/crud/products?limit=1&sort=createdAt&order=desc`, {
          headers: this.headers
        });
        
        if (listResponse.ok) {
          const listData = await listResponse.json();
          if (listData.data.length > 0) {
            console.log('✅ Product retrieved via REST API');
            console.log('   Product:', listData.data[0].name);
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error('❌ Complex scenarios failed:', error.message);
      return false;
    }
  }

  async runAllTests() {
    console.log('🚀 Starting MongoREST API Tests');
    console.log('==================================');
    
    if (this.token) {
      console.log('🔑 Using authentication token');
    } else {
      console.log('⚠️  No authentication token provided');
    }
    
    const results = [];
    
    results.push(await this.testHealthCheck());
    results.push(await this.testServiceInfo());
    
    if (this.token) {
      results.push(await this.testCRUDOperations());
      results.push(await this.testScriptExecution());
      results.push(await this.testBatchOperations());
      results.push(await this.testFunctionExecution());
      results.push(await this.testComplexScenarios());
    } else {
      console.log('\\n⚠️  Skipping authenticated tests (no token provided)');
    }
    
    const passed = results.filter(r => r).length;
    const total = results.length;
    
    console.log('\\n📊 Test Results');
    console.log('================');
    console.log(`Passed: ${passed}/${total}`);
    console.log(`Success Rate: ${Math.round((passed / total) * 100)}%`);
    
    if (passed === total) {
      console.log('\\n🎉 All tests passed! MongoREST is working correctly.');
    } else {
      console.log('\\n❌ Some tests failed. Check the logs above for details.');
    }
    
    return passed === total;
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const baseUrl = args[0] || 'http://localhost:3000';
  const token = args[1] || null;
  
  if (!token) {
    console.log('💡 Usage: node test-api.js [base_url] [jwt_token]');
    console.log('   Example: node test-api.js http://localhost:3000 eyJhbGciOiJIUzI1NiIs...');
    console.log('   Note: Without token, only public endpoints will be tested');
    console.log('');
  }
  
  const tester = new MongoRESTTester(baseUrl, token);
  
  tester.runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = MongoRESTTester;
