#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');

class MongoRESTSetup {
  constructor() {
    this.projectRoot = path.join(__dirname, '..');
    this.envFile = path.join(this.projectRoot, '.env');
  }

  async run() {
    console.log('🎉 Welcome to MongoREST Setup!');
    console.log('==========================================');
    
    try {
      await this.checkEnvironment();
      await this.setupEnvironment();
      await this.checkDependencies();
      await this.validateSchemas();
      await this.setupDatabase();
      await this.generateTestTokens();
      await this.finalInstructions();
    } catch (error) {
      console.error('❌ Setup failed:', error.message);
      process.exit(1);
    }
  }

  async checkEnvironment() {
    console.log('\\n📋 Checking environment...');
    
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    if (majorVersion < 18) {
      throw new Error(`Node.js 18+ required. Current version: ${nodeVersion}`);
    }
    
    console.log(`✅ Node.js version: ${nodeVersion}`);
    
    // Check if .env file exists
    if (!fs.existsSync(this.envFile)) {
      console.log('📝 Creating .env file from template...');
      const exampleFile = path.join(this.projectRoot, '.env.example');
      fs.copyFileSync(exampleFile, this.envFile);
      console.log('✅ .env file created');
    } else {
      console.log('✅ .env file exists');
    }
  }

  async setupEnvironment() {
    console.log('\\n🔧 Setting up environment...');
    
    // Load environment variables
    require('dotenv').config({ path: this.envFile });
    
    // Generate JWT secret if not provided
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your-super-secret-key-change-this-in-production') {
      const jwtSecret = this.generateSecretKey();
      this.updateEnvFile('JWT_SECRET', jwtSecret);
      console.log('✅ Generated new JWT secret');
    }
    
    console.log('✅ Environment configured');
  }

  async checkDependencies() {
    console.log('\\n📦 Checking dependencies...');
    
    const packageJson = require(path.join(this.projectRoot, 'package.json'));
    const requiredDeps = Object.keys(packageJson.dependencies);
    
    // Check if node_modules exists
    const nodeModulesPath = path.join(this.projectRoot, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      console.log('📦 Installing dependencies...');
      const { exec } = require('child_process');
      
      await new Promise((resolve, reject) => {
        exec('npm install', { cwd: this.projectRoot }, (error, stdout, stderr) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
      
      console.log('✅ Dependencies installed');
    } else {
      console.log('✅ Dependencies already installed');
    }
  }

  async validateSchemas() {
    console.log('\\n📋 Validating schemas...');
    
    try {
      const SchemaLoader = require(path.join(this.projectRoot, 'src/core/schema-loader'));
      const schemaLoader = new SchemaLoader();
      
      await schemaLoader.loadSchemas();
      console.log(`✅ Loaded ${schemaLoader.schemas.size} collection schemas`);
      console.log(`✅ Loaded ${schemaLoader.functions.size} function definitions`);
    } catch (error) {
      console.warn('⚠️  Schema validation warning:', error.message);
    }
  }

  async setupDatabase() {
    console.log('\\n🗄️  Setting up database...');
    
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mongorest';
    
    try {
      const client = new MongoClient(mongoUri);
      await client.connect();
      
      // Test connection
      await client.db().admin().ping();
      console.log('✅ Database connection successful');
      
      // Create indexes for collections
      const SchemaLoader = require(path.join(this.projectRoot, 'src/core/schema-loader'));
      const DatabaseManager = require(path.join(this.projectRoot, 'src/core/database-manager'));
      
      const schemaLoader = new SchemaLoader();
      const dbManager = new DatabaseManager();
      
      await schemaLoader.loadSchemas();
      await dbManager.connect();
      
      // Initialize collections and indexes
      await dbManager.initializeCollections(schemaLoader.schemas);
      
      console.log('✅ Database initialized with collections and indexes');
      
      await client.close();
      await dbManager.disconnect();
      
    } catch (error) {
      console.warn('⚠️  Database setup warning:', error.message);
      console.log('💡 Make sure MongoDB is running and accessible');
    }
  }

  async generateTestTokens() {
    console.log('\\n🔑 Generating test JWT tokens...');
    
    const jwtSecret = process.env.JWT_SECRET;
    const roles = ['admin', 'dev', 'analyst', 'user'];
    const tokens = {};
    
    for (const role of roles) {
      const payload = {
        sub: `test_${role}_user`,
        role: role,
        permissions: this.getPermissionsForRole(role),
        collections: this.getCollectionsForRole(role),
        functions: this.getFunctionsForRole(role),
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
        iss: 'mongorest',
        aud: 'mongorest-api'
      };
      
      tokens[role] = jwt.sign(payload, jwtSecret);
    }
    
    // Save tokens to file
    const tokensFile = path.join(this.projectRoot, 'test-tokens.json');
    fs.writeFileSync(tokensFile, JSON.stringify(tokens, null, 2));
    
    console.log('✅ Test tokens generated and saved to test-tokens.json');
    console.log('\\n🔑 Test Tokens:');
    for (const [role, token] of Object.entries(tokens)) {
      console.log(`   ${role}: ${token.substring(0, 50)}...`);
    }
  }

  async finalInstructions() {
    console.log('\\n🎉 Setup completed successfully!');
    console.log('==========================================');
    console.log('\\n🚀 Next steps:');
    console.log('\\n1. Start the server:');
    console.log('   npm run dev');
    console.log('\\n2. Open your browser:');
    console.log('   http://localhost:3000');
    console.log('\\n3. View API documentation:');
    console.log('   http://localhost:3000/docs');
    console.log('\\n4. Test the API:');
    console.log('   curl http://localhost:3000/health');
    console.log('\\n5. Use test tokens for authentication:');
    console.log('   See test-tokens.json for JWT tokens');
    console.log('\\n📚 For more information, see README.md');
    console.log('\\n💡 Tips:');
    console.log('   - Add your schemas to schemas/collections/');
    console.log('   - Define custom functions in schemas/functions/');
    console.log('   - Use /scripts/execute for MongoDB shell scripts');
    console.log('   - Check /health/status for system monitoring');
  }

  generateSecretKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let result = '';
    for (let i = 0; i < 64; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  updateEnvFile(key, value) {
    const envContent = fs.readFileSync(this.envFile, 'utf8');
    const lines = envContent.split('\\n');
    
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(`${key}=`)) {
        lines[i] = `${key}=${value}`;
        found = true;
        break;
      }
    }
    
    if (!found) {
      lines.push(`${key}=${value}`);
    }
    
    fs.writeFileSync(this.envFile, lines.join('\\n'));
  }

  getPermissionsForRole(role) {
    const permissions = {
      admin: ['*'],
      dev: ['read', 'create', 'update', 'analytics'],
      analyst: ['read', 'analytics'],
      user: ['read', 'create']
    };
    return permissions[role] || ['read'];
  }

  getCollectionsForRole(role) {
    const collections = {
      admin: ['*'],
      dev: ['users', 'products', 'orders', 'logs'],
      analyst: ['users', 'products', 'orders', 'analytics'],
      user: ['users', 'products', 'orders']
    };
    return collections[role] || ['users'];
  }

  getFunctionsForRole(role) {
    const functions = {
      admin: ['*'],
      dev: ['*'],
      analyst: ['generateUserReport', 'userAnalytics'],
      user: ['getUserProfile']
    };
    return functions[role] || [];
  }
}

// Run setup if called directly
if (require.main === module) {
  const setup = new MongoRESTSetup();
  setup.run().catch(console.error);
}

module.exports = MongoRESTSetup;
