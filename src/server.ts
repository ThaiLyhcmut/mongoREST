import fastifyLib, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as path from 'path';
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';

// Configure dotenv
dotenvConfig();

// ES module helpers
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import configuration interfaces
import {
  ServerConfig,
  AuthConfig,
  MethodConfig
} from './config/server.config.js';

interface MongoRESTContext {
  schemaLoader: SchemaLoader;
  dbManager: DatabaseManager;
  authManager: AuthManager;
  validationManager: ValidationManager;
  scriptParsingMiddleware: ScriptParsingMiddleware;
  relationshipMiddleware: any;
  crudGenerator: CRUDGenerator;
  functionExecutor: FunctionExecutor;
  scriptParser: MongoScriptParser;
}

// Extend FastifyRequest to include mongorest property
declare module 'fastify' {
  interface FastifyRequest {
    mongorest: MongoRESTContext;
  }
}

// Helper function to read JSON files
async function readJson(filePath: string): Promise<any> {
  const data = await fs.readFile(filePath, 'utf8');
  return JSON.parse(data);
}

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

class MongoRESTServer {
  private fastify: FastifyInstance | null;
  private schemaLoader: SchemaLoader | null;
  private dbManager: DatabaseManager | null;
  private authManager: AuthManager | null;
  private validationManager: ValidationManager | null;
  private scriptParsingMiddleware: ScriptParsingMiddleware | null;
  private relationshipMiddleware: any | null;
  private crudGenerator: CRUDGenerator | null;
  private functionExecutor: FunctionExecutor | null;
  private scriptParser: MongoScriptParser | null;

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

  async initialize(): Promise<void> {
    try {
      // Initialize Fastify with configuration
      this.fastify = fastifyLib({
        logger: {
          level: process.env.LOG_LEVEL || 'info'
          // Note: prettyPrint is deprecated in newer versions of Fastify
        },
        bodyLimit: parseInt(process.env.BODY_LIMIT!) || 10 * 1024 * 1024, // 10MB
        keepAliveTimeout: parseInt(process.env.KEEP_ALIVE_TIMEOUT!) || 5000
      });

      // Load configurations
      const serverConfig: ServerConfig = await readJson(path.join(__dirname, '../config/server.json'));
      const authConfig: AuthConfig = await readJson(path.join(__dirname, '../config/auth.json'));
      const methodConfig: MethodConfig = await readJson(path.join(__dirname, '../config/method-operations.json'));

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
      this.fastify.decorate('functionExecutor', this.functionExecutor);
      this.fastify.decorate('scriptParser', this.scriptParser);
      this.fastify.decorate('scriptParsingMiddleware', this.scriptParsingMiddleware);
      this.fastify.decorate('relationshipMiddleware', this.relationshipMiddleware);

      // Register plugins
      await this.registerPlugins(serverConfig);

      // Register middleware
      this.registerMiddleware();

      // Register routes
      await this.registerRoutes();

      this.fastify.log.info('MongoREST server initialized successfully');
    } catch (error) {
      if (this.fastify) {
        this.fastify.log.error('Error during server initialization:', error);
      } else {
        console.error('Error during server initialization:', error);
      }
      throw error;
    }
  }

  private async registerPlugins(config: ServerConfig): Promise<void> {
    if (!this.fastify) throw new Error('Fastify instance not initialized');    // CORS plugin
    const fastifyCors = await import('@fastify/cors');
    await this.fastify.register(fastifyCors.default, config.cors as any);

    // Helmet for security
    const fastifyHelmet = await import('@fastify/helmet');
    await this.fastify.register(fastifyHelmet.default);

    // Rate limiting
    const fastifyRateLimit = await import('@fastify/rate-limit');
    await this.fastify.register(fastifyRateLimit.default, config.rateLimit as any);// JWT plugin
    const fastifyJwt = await import('@fastify/jwt');
    await this.fastify.register(fastifyJwt.default, {
      secret: process.env.JWT_SECRET!,
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
    } as any);    // Swagger documentation
    if (config.swagger && config.swagger.enabled) {
      const fastifySwagger = await import('@fastify/swagger');
      const fastifySwaggerUi = await import('@fastify/swagger-ui');
      
      await this.fastify.register(fastifySwagger.default, config.swagger as any);
      await this.fastify.register(fastifySwaggerUi.default, {
        routePrefix: config.swagger.routePrefix || '/docs'
      });
    }
  }

  private registerMiddleware(): void {
    if (!this.fastify) throw new Error('Fastify instance not initialized');

    // Add mongorest context to request
    this.fastify.decorateRequest('mongorest', null);
    this.fastify.addHook('onRequest', async (request: FastifyRequest) => {
      request.mongorest = {
        schemaLoader: this.schemaLoader!,
        dbManager: this.dbManager!,
        authManager: this.authManager!,
        validationManager: this.validationManager!,
        scriptParsingMiddleware: this.scriptParsingMiddleware!,
        relationshipMiddleware: this.relationshipMiddleware!,
        crudGenerator: this.crudGenerator!,
        functionExecutor: this.functionExecutor!,
        scriptParser: this.scriptParser!
      };
    });

    // Decorate core authentication and authorization middleware
    this.fastify.decorate('authenticate', this.authManager!.authenticate.bind(this.authManager));
    this.fastify.decorate('authorize', this.authManager!.authorize.bind(this.authManager));
    this.fastify.decorate('authorizeCollection', this.authManager!.authorizeCollection.bind(this.authManager));
    this.fastify.decorate('authorizeFunction', this.authManager!.authorizeFunction.bind(this.authManager));

    // Register script parsing middleware decorators
    this.fastify.decorate('parseMongoScript', this.scriptParsingMiddleware!.parseMongoScript.bind(this.scriptParsingMiddleware));
    this.fastify.decorate('validateScript', this.scriptParsingMiddleware!.validateScript.bind(this.scriptParsingMiddleware));
    this.fastify.decorate('scriptRateLimit', this.scriptParsingMiddleware!.scriptRateLimit.bind(this.scriptParsingMiddleware));
    this.fastify.decorate('logScriptExecution', this.scriptParsingMiddleware!.logScriptExecution.bind(this.scriptParsingMiddleware));
    this.fastify.decorate('analyzeScript', this.scriptParsingMiddleware!.analyzeScript.bind(this.scriptParsingMiddleware));
    this.fastify.decorate('enhanceScriptResponse', this.scriptParsingMiddleware!.enhanceScriptResponse.bind(this.scriptParsingMiddleware));

    // Register validation middleware decorators
    this.fastify.decorate('validateMethodOperation', this.validationManager!.validateMethodOperation.bind(this.validationManager));

    // Register relationship middleware decorators
    this.fastify.decorate('parseRelationships', this.relationshipMiddleware!.parseRelationships.bind(this.relationshipMiddleware));
    this.fastify.decorate('validateRelationshipPermissions', this.relationshipMiddleware!.validateRelationshipPermissions.bind(this.relationshipMiddleware));
    this.fastify.decorate('logRelationshipQueries', this.relationshipMiddleware!.logRelationshipQueries.bind(this.relationshipMiddleware));
    this.fastify.decorate('authorizeRelationships', this.authManager!.authorizeRelationships.bind(this.authManager));

    // Error handler
    this.fastify.setErrorHandler(async (error: any, request: FastifyRequest, reply: FastifyReply) => {
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
    this.fastify.setNotFoundHandler(async (request: FastifyRequest, reply: FastifyReply) => {
      reply.code(404).send({
        error: 'Route not found',
        message: `Route ${request.method} ${request.url} not found`
      });
    });
  }

  private async registerRoutes(): Promise<void> {
    if (!this.fastify) throw new Error('Fastify instance not initialized');

    // Health check routes
    await this.fastify.register(healthRoutes, { prefix: '/health' });

    // CRUD routes - these are auto-generated based on schemas
    await this.fastify.register(async (fastify) => {
      await fastify.register(crudRoutes, { prefix: '/crud' });
    });

    // Function routes
    await this.fastify.register(async (fastify) => {
      await fastify.register(functionRoutes, { prefix: '/functions' });
    });

    // Script execution routes
    await this.fastify.register(async (fastify) => {
      await fastify.register(scriptRoutes, { prefix: '/scripts' });
    });

    // Root route
    this.fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
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
        collections: Array.from(this.schemaLoader!.schemas.keys()),
        functions: Array.from(this.schemaLoader!.functions.keys()),
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

  async start(): Promise<void> {
    try {
      if (!this.fastify) throw new Error('Fastify instance not initialized');

      const host: string = process.env.HOST || 'localhost';
      const port: number = parseInt(process.env.PORT!) || 3000;

      console.log(`Starting MongoREST server on http://${host}:${port}...`);
      
      // For Fastify v4, use the correct listen syntax
      await this.fastify.listen({ 
        host: host,
        port: port 
      });
      
      console.log(`✅ MongoREST server started at http://${host}:${port}`);
      this.fastify.log.info(`🚀 MongoREST server started at http://${host}:${port}`);
      this.fastify.log.info(`📚 API Documentation: http://${host}:${port}/docs`);
      this.fastify.log.info(`❤️ Health Check: http://${host}:${port}/health`);
      
      // Log available collections and functions
      const collections: string[] = Array.from(this.schemaLoader!.schemas.keys());
      const functions: string[] = Array.from(this.schemaLoader!.functions.keys());
      
      this.fastify.log.info(`📦 Available collections: ${collections.join(', ')}`);
      this.fastify.log.info(`⚙️ Available functions: ${functions.join(', ')}`);

    } catch (error) {
      console.error('❌ Failed to start server:', error);
      this.fastify!.log.error('Failed to start server:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      if (this.fastify) {
        await this.fastify.close();
      }
      if (this.dbManager) {
        await this.dbManager.disconnect();
      }
      this.fastify!.log.info('MongoREST server stopped gracefully');
    } catch (error) {
      this.fastify!.log.error('Error stopping server:', error);
      throw error;
    }
  }
}

// Global server variable for shutdown handlers
let server: MongoRESTServer | null = null;

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  if (server) {
    await server.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  if (server) {
    await server.stop();
  }
  process.exit(0);
});

// Start server if this file is run directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || 
    import.meta.url.endsWith('server.ts')) {
  server = new MongoRESTServer();
  
  server.initialize()
    .then(() => server!.start())
    .catch((error: Error) => {
      console.error('Failed to start MongoREST server:', error);
      process.exit(1);
    });
}

export default MongoRESTServer;
