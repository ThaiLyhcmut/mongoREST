#!/usr/bin/env node

// Development setup script
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

async function setup() {
  console.log('🚀 Setting up MongoREST development environment...\n');

  try {
    // Check if .env exists
    const envPath = path.join(process.cwd(), '.env');
    try {
      await fs.access(envPath);
      console.log('✅ .env file exists');
    } catch {
      console.log('📝 Creating .env file from template...');
      const envExample = await fs.readFile('.env.example', 'utf8');
      await fs.writeFile('.env', envExample);
      console.log('✅ Created .env file');
    }

    // Validate schemas
    console.log('\n🔍 Validating schemas...');
    await runScript('validate-schemas.js');

    // Check MongoDB connection
    console.log('\n🔌 Checking MongoDB connection...');
    await checkMongoDB();

    // Build documentation
    console.log('\n📚 Building documentation...');
    await runScript('build-docs.js');

    // Install git hooks
    console.log('\n🪝 Setting up git hooks...');
    await setupGitHooks();

    console.log('\n✅ Development environment setup completed successfully!');
    console.log('\nNext steps:');
    console.log('  1. Review .env configuration');
    console.log('  2. Start MongoDB: docker-compose up mongo -d');
    console.log('  3. Start development server: npm run dev');
    console.log('  4. Access documentation: http://localhost:3000/docs');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

function runScript(scriptName) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, scriptName);
    const child = spawn('node', [scriptPath], { stdio: 'inherit' });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script ${scriptName} failed with code ${code}`));
      }
    });
    
    child.on('error', reject);
  });
}

async function checkMongoDB() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mongorest';
  
  try {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(mongoUri);
    
    await client.connect();
    await client.db().admin().ping();
    await client.close();
    
    console.log('✅ MongoDB connection successful');
  } catch (error) {
    console.log('⚠️  MongoDB connection failed:', error.message);
    console.log('   Make sure MongoDB is running or start with: docker-compose up mongo -d');
  }
}

async function setupGitHooks() {
  const gitHooksDir = path.join(process.cwd(), '.git', 'hooks');
  
  try {
    await fs.access(gitHooksDir);
    
    const preCommitHook = `#!/bin/sh
# MongoREST pre-commit hook
echo "🔍 Running pre-commit checks..."

# Validate schemas
npm run validate-schemas
if [ $? -ne 0 ]; then
  echo "❌ Schema validation failed"
  exit 1
fi

# Lint code
npm run lint
if [ $? -ne 0 ]; then
  echo "❌ Linting failed"
  exit 1
fi

echo "✅ Pre-commit checks passed"
`;

    const preCommitPath = path.join(gitHooksDir, 'pre-commit');
    await fs.writeFile(preCommitPath, preCommitHook);
    await fs.chmod(preCommitPath, '755');
    
    console.log('✅ Git pre-commit hook installed');
  } catch (error) {
    console.log('⚠️  Git hooks setup skipped (not a git repository)');
  }
}

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setup();
}

export { setup };
