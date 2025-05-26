#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

/**
 * Complete setup script for MongoREST with Relationship System
 * This script sets up the entire system and runs comprehensive tests
 */
class MongoRESTSetup {
  constructor() {
    this.steps = [];
    this.currentStep = 0;
  }

  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = {
      info: '📋',
      success: '✅',
      error: '❌',
      warning: '⚠️',
      process: '🔄'
    };
    
    console.log(`${prefix[type]} [${timestamp}] ${message}`);
  }

  async runCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      this.log(`Running: ${command} ${args.join(' ')}`, 'process');
      
      const child = spawn(command, args, {
        stdio: options.silent ? 'ignore' : 'inherit',
        shell: true,
        ...options
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with exit code ${code}`));
        }
      });

      child.on('error', reject);
    });
  }

  async checkPrerequisites() {
    this.log('Checking prerequisites...', 'process');
    
    try {
      // Check Node.js version
      await this.runCommand('node', ['--version'], { silent: true });
      this.log('Node.js is installed', 'success');
      
      // Check npm
      await this.runCommand('npm', ['--version'], { silent: true });
      this.log('npm is available', 'success');
      
      // Check MongoDB connection
      const { MongoClient } = require('mongodb');
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mongorest';
      
      try {
        const client = new MongoClient(mongoUri);
        await client.connect();
        await client.db().admin().ping();
        await client.close();
        this.log('MongoDB connection successful', 'success');
      } catch (error) {
        this.log(`MongoDB connection failed: ${error.message}`, 'warning');
        this.log('Make sure MongoDB is running on the default port', 'info');
      }
      
    } catch (error) {
      this.log(`Prerequisite check failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async installDependencies() {
    this.log('Installing dependencies...', 'process');
    
    try {
      await this.runCommand('npm', ['install']);
      this.log('Dependencies installed successfully', 'success');
    } catch (error) {
      this.log(`Failed to install dependencies: ${error.message}`, 'error');
      throw error;
    }
  }

  async validateSchemas() {
    this.log('Validating schemas...', 'process');
    
    try {
      await this.runCommand('npm', ['run', 'validate-schemas']);
      this.log('Schema validation completed', 'success');
    } catch (error) {
      this.log(`Schema validation failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async generateSampleData() {
    this.log('Generating sample data...', 'process');
    
    try {
      await this.runCommand('npm', ['run', 'generate-sample-data']);
      this.log('Sample data generated successfully', 'success');
    } catch (error) {
      this.log(`Failed to generate sample data: ${error.message}`, 'warning');
      this.log('Continuing without sample data...', 'info');
    }
  }

  async startServer() {
    this.log('Starting MongoREST server...', 'process');
    
    return new Promise((resolve, reject) => {
      const server = spawn('npm', ['run', 'dev'], {
        stdio: 'pipe',
        shell: true
      });

      let serverReady = false;
      let output = '';

      server.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        
        if (text.includes('server started') || text.includes('listening')) {
          if (!serverReady) {
            serverReady = true;
            this.log('Server is ready for testing', 'success');
            resolve(server);
          }
        }
      });

      server.stderr.on('data', (data) => {
        const text = data.toString();
        if (!text.includes('warning') && !text.includes('info')) {
          this.log(`Server error: ${text}`, 'warning');
        }
      });

      server.on('close', (code) => {
        if (!serverReady) {
          reject(new Error(`Server failed to start (exit code: ${code})`));
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (!serverReady) {
          server.kill();
          reject(new Error('Server startup timeout'));
        }
      }, 30000);
    });
  }

  async runTests(serverProcess) {
    this.log('Running relationship system tests...', 'process');
    
    try {
      // Wait a moment for server to be fully ready
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Run relationship tests
      await this.runCommand('npm', ['run', 'test:relationships']);
      this.log('Relationship tests completed successfully', 'success');
      
    } catch (error) {
      this.log(`Tests failed: ${error.message}`, 'error');
      throw error;
    } finally {
      if (serverProcess && !serverProcess.killed) {
        this.log('Stopping test server...', 'process');
        serverProcess.kill();
        // Wait for graceful shutdown
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  async createExampleFiles() {
    this.log('Creating example files...', 'process');
    
    const examples = [
      {
        file: 'examples/basic-queries.md',
        content: `# Basic MongoREST Queries

## Simple Collection Queries
\`\`\`bash
# Get all users
GET /crud/users

# Get users with pagination
GET /crud/users?page=1&limit=10

# Filter users by country
GET /crud/users?profile.country=eq.Vietnam
\`\`\`

## Relationship Queries
\`\`\`bash
# Users with their orders
GET /crud/users?select=name,email,orders(orderNumber,totalAmount)

# Orders with customer details
GET /crud/orders?select=orderNumber,totalAmount,customer(name,email,profile)

# Products with categories and reviews
GET /crud/products?select=name,price,categories:product_categories.category(name),reviews(rating,title)
\`\`\`
`
      },
      {
        file: 'examples/curl-examples.sh',
        content: `#!/bin/bash

# MongoREST API Examples using curl
BASE_URL="http://localhost:3000"
AUTH_TOKEN="Bearer your-jwt-token-here"

echo "🚀 MongoREST API Examples"
echo "========================"

echo "\\n📋 1. Basic User Query"
curl -H "Authorization: $AUTH_TOKEN" \\
     "$BASE_URL/crud/users?limit=3"

echo "\\n🔗 2. Users with Orders (Relationship)"
curl -H "Authorization: $AUTH_TOKEN" \\
     "$BASE_URL/crud/users?select=name,email,orders(orderNumber,totalAmount,status)"

echo "\\n🔍 3. Filtered Relationship Query"
curl -H "Authorization: $AUTH_TOKEN" \\
     "$BASE_URL/crud/users?select=name,orders(orderNumber,totalAmount)&orders.status=eq.delivered"

echo "\\n📊 4. Complex Multi-Relationship Query"
curl -H "Authorization: $AUTH_TOKEN" \\
     "$BASE_URL/crud/products?select=name,price,categories:product_categories.category(name),reviews(rating,title,user(name))"

echo "\\n⚡ 5. Aggregated Relationship"
curl -H "Authorization: $AUTH_TOKEN" \\
     "$BASE_URL/crud/products?select=name,price,reviewCount:reviews!count,avgRating:reviews!avg(rating)"
`
      }
    ];

    try {
      await fs.mkdir('examples', { recursive: true });
      
      for (const example of examples) {
        await fs.writeFile(example.file, example.content);
        this.log(`Created: ${example.file}`, 'success');
      }
    } catch (error) {
      this.log(`Failed to create example files: ${error.message}`, 'warning');
    }
  }

  async printSummary() {
    this.log('\\n' + '='.repeat(60), 'info');
    this.log('🎉 MongoREST Setup Complete!', 'success');
    this.log('='.repeat(60), 'info');
    
    console.log(`
📚 Documentation:
   • Relationship Guide: ./RELATIONSHIPS.md
   • API Documentation: http://localhost:3000/docs (when server is running)
   • Examples: ./examples/

🚀 Quick Start:
   • Start server: npm run dev
   • Test relationships: npm run test:relationships
   • Generate data: npm run generate-sample-data

🔗 Example Relationship Queries:
   • GET /crud/users?select=name,orders(orderNumber,totalAmount)
   • GET /crud/orders?select=orderNumber,customer(name,email)
   • GET /crud/products?select=name,categories:product_categories.category(name)

🧪 Testing:
   • All tests: npm run test:relationships
   • Specific: node scripts/test-relationships.js [basic|relationships|filtering]

🔧 Key Features Enabled:
   ✅ PostgREST-style relationship queries
   ✅ belongsTo, hasMany, manyToMany relationships
   ✅ Nested relationships (3+ levels deep)
   ✅ Relationship filtering and aggregation
   ✅ Security and permission controls
   ✅ Performance optimizations
`);
    
    this.log('Happy coding! 🚀', 'success');
  }

  async run() {
    const steps = [
      { name: 'Check Prerequisites', fn: () => this.checkPrerequisites() },
      { name: 'Install Dependencies', fn: () => this.installDependencies() },
      { name: 'Validate Schemas', fn: () => this.validateSchemas() },
      { name: 'Generate Sample Data', fn: () => this.generateSampleData() },
      { name: 'Create Examples', fn: () => this.createExampleFiles() }
    ];

    console.log('🚀 MongoREST Complete Setup');
    console.log('='.repeat(40));
    
    try {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        this.log(`Step ${i + 1}/${steps.length}: ${step.name}`, 'process');
        await step.fn();
      }

      // Interactive test option
      const runTests = process.argv.includes('--test') || process.argv.includes('-t');
      
      if (runTests) {
        this.log('Starting server for testing...', 'process');
        const serverProcess = await this.startServer();
        
        try {
          await this.runTests(serverProcess);
        } catch (error) {
          this.log(`Test execution failed: ${error.message}`, 'error');
        }
      }

      await this.printSummary();
      
    } catch (error) {
      this.log(`Setup failed: ${error.message}`, 'error');
      process.exit(1);
    }
  }
}

// Command line options
function printUsage() {
  console.log(`
Usage: node scripts/complete-setup.js [options]

Options:
  --test, -t    Run relationship tests after setup
  --help, -h    Show this help message

Examples:
  node scripts/complete-setup.js          # Setup only
  node scripts/complete-setup.js --test   # Setup and test
  npm run setup-dev                       # Same as above with npm
`);
}

// Main execution
if (require.main === module) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const setup = new MongoRESTSetup();
  setup.run().catch(error => {
    console.error('💥 Setup failed:', error);
    process.exit(1);
  });
}

module.exports = MongoRESTSetup;
