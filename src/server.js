import fastify from 'fastify';
import path from 'path';
import 'dotenv/config';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

// Get the current directory and filename
const __filename = fileURLToPath(import.meta.url);

// Import core modules
import SchemaLoader from './core/schema-loader.js';
import DatabaseManager from './core/database-manager.js';
import AuthManager from './middleware/auth.js';
import ValidationManager from './middleware/validation.js';
import ScriptParsingMiddleware from './middleware/script-parsing.js';
import { createRelationshipMiddleware } from './middleware/relationships.js';
import CRUDGenerator from './core/crud-generator.js';
import FunctionExecutor from './core/function-executor.js';
import MongoScriptParser from './core/script-parser.js';

// Import routes
import crudRoutes from './routes/crud.js';
import functionRoutes from './routes/functions.js';
import scriptRoutes from './routes/scripts.js';
import healthRoutes from './routes/health.js';

async function readJson(filePath) {
  const data = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(data);
}

class MongoRESTServer {
  constructor() {
    this.fastify = null;
    this.schemaLoader = null;
    this.dbManager = null;
    this.authManager = null;
    this.validationManager = null;
    this.scriptParsingMiddleware = null;
    this.relationshipMiddleware = null;
    this.crudGenerator = null;
    this.functionExecutor = null;
    this.scriptParser = null;
  }

  async initialize() {
    try {
      // Initialize Fastify with configuration
      this.fastify = fastify({
        logger: {
          level: process.env.LOG_LEVEL || 'info',
          // prettyPrint: process.env.NODE_ENV === 'development'
        },
        bodyLimit: parseInt(process.env.BODY_LIMIT) || 10 * 1024 * 1024, // 10MB
        keepAliveTimeout: parseInt(process.env.KEEP_ALIVE_TIMEOUT) || 5000
      });

      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const serverConfig = await readJson(path.join(__dirname, '../config/server.json'));
      const authConfig = await readJson(path.join(__dirname, '../config/auth.json'));
      const methodConfig = await readJson(path.join(__dirname, '../config/method-operations.json'));

      // Initialize core components
      this.schemaLoader = new SchemaLoader();
      this.dbManager = new DatabaseManager();
      this.authManager = new AuthManager(authConfig);
      this.validationManager = new ValidationManager(methodConfig);
      this.scriptParsingMiddleware = new ScriptParsingMiddleware();
      this.scriptParser = this.scriptParsingMiddleware.getParser();

      // Load schemas and connect to database
      await this.schemaLoader.loadSchemas();
      await this.dbManager.connect();

      // Initialize relationship middleware after schemas are loaded
      this.relationshipMiddleware = createRelationshipMiddleware(this.schemaLoader);

      // Initialize generators
      this.crudGenerator = new CRUDGenerator(this.schemaLoader, this.dbManager);
      this.functionExecutor = new FunctionExecutor(this.schemaLoader, this.dbManager);

      // Decorate Fastify instance with core components so plugins can access them
      this.fastify.decorate('schemaLoader', this.schemaLoader);
      this.fastify.decorate('dbManager', this.dbManager);
      this.fastify.decorate('authManager', this.authManager);
      this.fastify.decorate('validationManager', this.validationManager);
      this.fastify.decorate('crudGenerator', this.crudGenerator);
      // this.fastify.decorate('functionExecutor', this.functionExecutor); // Add if functionRoutes needs it
      // this.fastify.decorate('scriptParser', this.scriptParser); // Add if needed
      // this.fastify.decorate('scriptParsingMiddleware', this.scriptParsingMiddleware); // Add if needed
      // this.fastify.decorate('relationshipMiddleware', this.relationshipMiddleware); // Add if needed


      // Register plugins
      await this.registerPlugins(serverConfig);

      // Register middleware
      this.registerMiddleware();

      // Register routes
      await this.registerRoutes();

      this.fastify.log.info('MongoREST server initialized successfully');
    } catch (error) {
      if (this.fastify && this.fastify.log) {
        this.fastify.log.error('Failed to initialize server:', error);
      } else {
        console.error('Failed to initialize server:', error);
      }
      throw error;
    }
  }

  async registerPlugins(config) {
    // CORS plugin
    const fastifyCors = (await import('@fastify/cors')).default;
    await this.fastify.register(fastifyCors, config.cors);

    // Helmet for security
    const fastifyHelmet = (await import('@fastify/helmet')).default;
    await this.fastify.register(fastifyHelmet);

    // Rate limiting
    const fastifyRateLimit = (await import('@fastify/rate-limit')).default;
    await this.fastify.register(fastifyRateLimit, config.rateLimit);

    // JWT plugin
    const fastifyJwt = (await import('@fastify/jwt')).default;
    await this.fastify.register(fastifyJwt, {
      secret: process.env.JWT_SECRET,
      sign: {
        algorithm: 'HS256',
        issuer: 'mongorest',
        audience: 'mongorest-api',
        expiresIn: process.env.JWT_EXPIRES_IN || '24h'
      },
      verify: {
        algorithms: ['HS256'],
        issuer: 'mongorest',
        audience: 'mongorest-api'
      }
    });

    // Swagger documentation
    if (config.swagger && config.swagger.enabled) {
      const fastifySwagger = (await import('@fastify/swagger')).default;
      await this.fastify.register(fastifySwagger, config.swagger);
      const fastifySwaggerUi = (await import('@fastify/swagger-ui')).default;
      await this.fastify.register(fastifySwaggerUi, {
        routePrefix: config.swagger.routePrefix || '/docs'
      });
    }
  }

  registerMiddleware() {
    // Add context to request
    this.fastify.decorateRequest('context', null);
    this.fastify.addHook('onRequest', async (request) => {
      request.context = {
        schemaLoader: this.schemaLoader,
        dbManager: this.dbManager,
        authManager: this.authManager,
        validationManager: this.validationManager,
        scriptParsingMiddleware: this.scriptParsingMiddleware,
        relationshipMiddleware: this.relationshipMiddleware,
        crudGenerator: this.crudGenerator,
        functionExecutor: this.functionExecutor,
        scriptParser: this.scriptParser
      };
    });

    // Decorate core middleware functions
    this.fastify.decorate('authenticate', this.authManager.authenticate.bind(this.authManager));
    this.fastify.decorate('authorize', this.authManager.authorize.bind(this.authManager));
    this.fastify.decorate('authorizeCollection', this.authManager.authorizeCollection.bind(this.authManager));
    this.fastify.decorate('authorizeFunction', this.authManager.authorizeFunction.bind(this.authManager));

    this.fastify.decorate('parseMongoScript', this.scriptParsingMiddleware.parseMongoScript.bind(this.scriptParsingMiddleware));
    this.fastify.decorate('validateScript', this.scriptParsingMiddleware.validateScript.bind(this.scriptParsingMiddleware));
    this.fastify.decorate('scriptRateLimit', this.scriptParsingMiddleware.scriptRateLimit.bind(this.scriptParsingMiddleware));
    this.fastify.decorate('logScriptExecution', this.scriptParsingMiddleware.logScriptExecution.bind(this.scriptParsingMiddleware));
    this.fastify.decorate('analyzeScript', this.scriptParsingMiddleware.analyzeScript.bind(this.scriptParsingMiddleware));
    this.fastify.decorate('enhanceScriptResponse', this.scriptParsingMiddleware.enhanceScriptResponse.bind(this.scriptParsingMiddleware));

    // Register relationship middleware decorators
    this.fastify.decorate('parseRelationships', this.relationshipMiddleware.parseRelationships.bind(this.relationshipMiddleware));
    this.fastify.decorate('validateRelationshipPermissions', this.relationshipMiddleware.validateRelationshipPermissions.bind(this.relationshipMiddleware));
    this.fastify.decorate('logRelationshipQueries', this.relationshipMiddleware.logRelationshipQueries.bind(this.relationshipMiddleware));
    this.fastify.decorate('authorizeRelationships', this.authManager.authorizeRelationships.bind(this.authManager));

    // Error handler
    this.fastify.setErrorHandler(async (error, request, reply) => {
      request.log.error(error);

      // JWT errors
      if (error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
        return reply.code(401).send({
          error: 'Authentication required',
          message: 'JWT token missing from Authorization header'
        });
      }

      if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID') {
        return reply.code(401).send({
          error: 'Invalid token',
          message: 'JWT token is invalid or expired'
        });
      }

      // Validation errors
      if (error.validation) {
        return reply.code(400).send({
          error: 'Validation failed',
          message: error.message,
          details: error.validation
        });
      }

      // MongoDB errors
      if (error.code === 11000) {
        return reply.code(409).send({
          error: 'Duplicate key error',
          message: 'A document with this unique field already exists'
        });
      }

      // Rate limit errors
      if (error.statusCode === 429) {
        return reply.code(429).send({
          error: 'Rate limit exceeded',
          message: 'Too many requests, please try again later'
        });
      }

      // Generic server error
      reply.code(500).send({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      });
    });

    // Not found handler
    this.fastify.setNotFoundHandler(async (request, reply) => {
      reply.code(404).send({
        error: 'Route not found',
        message: `Route ${request.method} ${request.url} not found`
      });
    });
  }

  async registerRoutes() {
    // Health check routes
    await this.fastify.register(healthRoutes, { prefix: '/health' });

    // CRUD routes - these are auto-generated based on schemas
    await this.fastify.register(crudRoutes, { prefix: '/crud' });

    // Function routes
    await this.fastify.register(functionRoutes, { prefix: '/functions' });

    // Script execution routes
    await this.fastify.register(scriptRoutes, { prefix: '/scripts' });

    // Root route
    this.fastify.get('/', async (request, reply) => {
      return {
        service: 'MongoREST',
        version: '1.0.0',
        description: 'PostgREST-inspired REST API for MongoDB',
        documentation: '/docs',
        health: '/health',
        endpoints: {
          crud: '/crud',
          functions: '/functions',
          scripts: '/scripts'
        },
        collections: Array.from(this.schemaLoader.schemas.keys()),
        functions: Array.from(this.schemaLoader.functions.keys()),
        features: {
          relationships: true,
          postgreSQLStyleQueries: true,
          nestedRelationships: true,
          relationshipFiltering: true,
          scriptExecution: true,
          batchOperations: true,
          scriptValidation: true,
          complexityAnalysis: true
        }
      };
    });
  }

  async start() {
    try {
      const host = process.env.HOST || 'localhost';
      const port = parseInt(process.env.PORT) || 3000;

      await this.fastify.listen({ host, port });

      this.fastify.log.info(`MongoREST server started at http://${host}:${port}`);
      this.fastify.log.info(`API Documentation: http://${host}:${port}/docs`);
      this.fastify.log.info(`Health Check: http://${host}:${port}/health`);

      // Log available collections and functions
      const collections = Array.from(this.schemaLoader.schemas.keys());
      const functions = Array.from(this.schemaLoader.functions.keys());

      this.fastify.log.info(`Available collections: ${collections.join(', ')}`);
      this.fastify.log.info(`Available functions: ${functions.join(', ')}`);
    } catch (error) {
      this.fastify.log.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  async stop() {
    try {
      await this.fastify.close();
      await this.dbManager.disconnect();
      this.fastify.log.info('MongoREST server stopped gracefully');
    } catch (error) {
      this.fastify.log.error('Error stopping server:', error);
      throw error;
    }
  }
}

let server = null;

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\\nReceived SIGINT, shutting down gracefully...');
  if (server) {
    await server.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\\nReceived SIGTERM, shutting down gracefully...');
  if (server) {
    await server.stop();
  }
  process.exit(0);
});

// Start server if this file is run directly
if (__filename === process.argv[1]) {
  server = new MongoRESTServer();

  server.initialize()
    .then(() => server.start())
    .catch(error => {
      console.error('Failed to start MongoREST server:', error);
      process.exit(1);
    });
}

export default MongoRESTServer;
