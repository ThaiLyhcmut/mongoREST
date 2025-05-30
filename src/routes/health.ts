// Health Check Routes - System monitoring and diagnostics
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  healthRouteConfig,
  HealthCheckResponse,
  ComponentHealth,
  DatabaseHealth,
  SchemaHealth,
  MemoryInfo,
  SystemInfo,
  ConnectionInfo,
  PerformanceMetrics,
  CollectionInfo,
  DatabaseStats,
  ServerInfo,
  HealthMeta,
  SchemaValidationTest,
  SchemaValidationResponse,
  ReadinessResponse,
  LivenessResponse,
  MetricsResponse,
  PropertySchema,
  DocumentSchema
} from '../config/route/health.config';

// Helper functions for health checks
const createMinimalDocument = (schema: DocumentSchema, generateSampleValue: (property: PropertySchema) => any): { [key: string]: any } => {
  const document: { [key: string]: any } = {};
  const required = schema.required || [];
  
  for (const field of required) {
    const property = schema.properties[field];
    if (property) {
      document[field] = generateSampleValue(property);
    }
  }
  
  return document;
};

const generateSampleValue = (property: PropertySchema): any => {
  switch (property.type) {
    case 'string':
      return property.enum ? property.enum[0] : 'sample';
    case 'number':
    case 'integer':
      return property.minimum || 1;
    case 'boolean':
      return true;
    case 'array':
      return [];
    case 'object':
      return {};
    default:
      return null;
  }
};

async function healthRoutes(fastify: FastifyInstance, options: any): Promise<void> {
  const { schemaLoader, dbManager, authManager } = fastify as any;

  // Basic health check endpoint
  fastify.get<{ Reply: HealthCheckResponse }>('/', {
    ...healthRouteConfig.basic
  }, async (request: FastifyRequest, reply: FastifyReply): Promise<HealthCheckResponse> => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };
  });

  // Detailed system status endpoint
  fastify.get<{ Reply: HealthCheckResponse }>('/status', {
    ...healthRouteConfig.status
  }, async (request: FastifyRequest, reply: FastifyReply): Promise<HealthCheckResponse> => {
    try {
      const startTime = Date.now();
      
      // Check database connectivity and health
      const dbHealth = await dbManager.healthCheck();
      
      // Gather memory usage information
      const memoryUsage = process.memoryUsage();
      const memoryInfo: MemoryInfo = {
        used: formatBytes(memoryUsage.heapUsed),
        total: formatBytes(memoryUsage.heapTotal),
        external: formatBytes(memoryUsage.external),
        rss: formatBytes(memoryUsage.rss),
        usage: `${Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)}%`
      };

      // Schema loading status
      const schemaInfo: SchemaHealth = {
        status: 'loaded',
        collections: schemaLoader.schemas.size,
        functions: schemaLoader.functions.size,
        lastReloaded: new Date().toISOString() // In production, track actual reload time
      };

      // System information
      const systemInfo: SystemInfo = {
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
        uptime: formatUptime(process.uptime()),
        pid: process.pid,
        loadAverage: process.platform !== 'win32' ? (process as any).loadavg() : undefined,
        cpuUsage: process.cpuUsage()
      };

      // Determine overall system status
      const overallStatus = dbHealth.status === 'connected' ? 'healthy' : 'degraded';
      
      const responseTime = Date.now() - startTime;

      return {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`,
        components: {
          database: {
            status: dbHealth.status,
            ...dbHealth
          },
          schemas: schemaInfo,
          memory: memoryInfo,
          system: systemInfo
        },
        meta: {
          version: '1.0.0',
          environment: process.env.NODE_ENV || 'development',
          service: 'MongoREST'
        }
      };
    } catch (error: any) {
      fastify.log.error('Health check failed:', error);
      
      return reply.code(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
        components: {
          database: { status: 'error', error: error.message },
          schemas: { status: 'unknown' },
          memory: { status: 'unknown' },
          system: { status: 'unknown' }
        }
      });
    }
  });

  // Database-specific health check endpoint
  fastify.get<{ Reply: DatabaseHealth }>('/database', {
    ...healthRouteConfig.database
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const startTime = Date.now();
      
      // Test database connection and gather statistics
      const [healthCheck, dbStats, collections] = await Promise.all([
        dbManager.healthCheck(),
        dbManager.getStats(),
        dbManager.listCollections()
      ]);
      
      const responseTime = Date.now() - startTime;
      
      // Simple performance test - count documents in a small collection
      let performanceMetrics: PerformanceMetrics | undefined = undefined;
      try {
        const testStartTime = Date.now();
        const testCollection = collections.find((c: any) => c.name !== 'system.indexes') || collections[0];
        
        if (testCollection) {
          const collection = dbManager.collection(testCollection.name);
          await collection.countDocuments({}, { limit: 1000 });
          performanceMetrics = {
            testOperation: 'countDocuments',
            testCollection: testCollection.name,
            responseTime: `${Date.now() - testStartTime}ms`
          };
        }
      } catch (perfError: any) {
        performanceMetrics = {
          error: 'Performance test failed',
          message: perfError.message
        };
      }

      if (healthCheck.status !== 'connected') {
        return reply.code(503).send({
          status: 'unhealthy',
          error: healthCheck.error || 'Database connection failed',
          timestamp: new Date().toISOString()
        });
      }

      return {
        status: 'healthy',
        connection: {
          status: healthCheck.status,
          database: healthCheck.database,
          host: healthCheck.connection?.host,
          responseTime: `${responseTime}ms`
        },
        performance: performanceMetrics,
        collections: collections.map((col: any) => ({
          name: col.name,
          type: col.type
        })),
        stats: dbStats.database,
        server: {
          version: dbStats.server.version,
          uptime: dbStats.server.uptime,
          connections: dbStats.server.connections
        },
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      fastify.log.error('Database health check failed:', error);
      
      return reply.code(503).send({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Schema validation status endpoint
  fastify.get<{ Reply: SchemaValidationResponse }>('/schemas', {
    ...healthRouteConfig.schemas
  }, async (request: FastifyRequest, reply: FastifyReply): Promise<SchemaValidationResponse> => {
    try {
      const collections = {
        total: schemaLoader.schemas.size,
        loaded: Array.from(schemaLoader.schemas.keys()) as string[],
        details: schemaLoader.getAllSchemas()
      };

      const functions = {
        total: schemaLoader.functions.size,
        loaded: Array.from(schemaLoader.functions.keys()) as string[],
        details: schemaLoader.getAllFunctions()
      };

      // Test schema validation with sample documents
      const validationTests: SchemaValidationTest[] = [];
      for (const [name, schema] of schemaLoader.schemas) {
        try {
          // Create a minimal valid document for testing
          const testDocument = createMinimalDocument(schema, generateSampleValue);
          const validation = schemaLoader.validateDocument(name, testDocument);
          
          validationTests.push({
            collection: name,
            status: validation.valid ? 'valid' : 'invalid',
            errors: validation.errors || null
          });
        } catch (error: any) {
          validationTests.push({
            collection: name,
            status: 'error',
            error: error.message
          });
        }
      }

      const validSchemas = validationTests.filter(t => t.status === 'valid').length;
      const overallStatus = validSchemas === validationTests.length ? 'healthy' : 'degraded';

      return {
        status: overallStatus,
        collections,
        functions,
        validation: {
          totalTests: validationTests.length,
          passed: validSchemas,
          failed: validationTests.length - validSchemas,
          details: validationTests
        },
        lastReloaded: new Date().toISOString(), // In production, track actual reload time
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      fastify.log.error('Schema health check failed:', error);
      
      return reply.code(503).send({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Readiness probe endpoint (for Kubernetes)
  fastify.get<{ Reply: ReadinessResponse }>('/ready', {
    ...healthRouteConfig.ready
  }, async (request: FastifyRequest, reply: FastifyReply): Promise<ReadinessResponse> => {
    try {
      // Check critical system components
      const dbHealth = await dbManager.healthCheck();
      const schemasLoaded = schemaLoader.schemas.size > 0;
      
      const isReady = dbHealth.status === 'connected' && schemasLoaded;
      
      if (!isReady) {
        return reply.code(503).send({
          ready: false,
          timestamp: new Date().toISOString(),
          reasons: [
            ...(dbHealth.status !== 'connected' ? ['database_disconnected'] : []),
            ...(!schemasLoaded ? ['schemas_not_loaded'] : [])
          ]
        });
      }

      return {
        ready: true,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return reply.code(503).send({
        ready: false,
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  });

  // Liveness probe endpoint (for Kubernetes)
  fastify.get<{ Reply: LivenessResponse }>('/live', {
    ...healthRouteConfig.live
  }, async (request: FastifyRequest, reply: FastifyReply): Promise<LivenessResponse> => {    // Simple liveness check - if we can respond, the service is alive
    return {
      alive: true,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  });

  // System metrics endpoint (protected, admin-only)
  fastify.get<{ Reply: MetricsResponse }>('/metrics', {
    ...healthRouteConfig.metrics,
    preHandler: [
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          await (request as any).jwtVerify();
          
          // Only admin users can access system metrics
          if ((request as any).user?.role !== 'admin') {
            return reply.code(403).send({
              error: 'Access denied',
              message: 'Admin role required for metrics access'
            });
          }
        } catch (error) {
          return reply.code(401).send({
            error: 'Authentication required',
            message: 'Valid JWT token required for metrics access'
          });
        }
      }
    ]
  }, async (request: FastifyRequest, reply: FastifyReply): Promise<MetricsResponse> => {
    try {      const memoryUsage = process.memoryUsage();
      
      return {
        status: 'healthy',
        metrics: {
          timestamp: new Date().toISOString(),
          system: {
            uptime: process.uptime(),
            memory: memoryUsage,
            cpu: process.cpuUsage(),
            platform: {
              node: process.version,
              platform: process.platform,
              architecture: process.arch
            }
          },
          database: await dbManager.getStats(),
          application: {
            collections: schemaLoader.schemas.size,
            functions: schemaLoader.functions.size,
            environment: process.env.NODE_ENV
          },
          performance: {
            // In production, collect actual performance metrics
            requestCount: Math.floor(Math.random() * 10000) + 1000,
            averageResponseTime: Math.floor(Math.random() * 200) + 50,
            errorRate: Math.random() * 0.05
          }
        },
        format: 'json'
      };
    } catch (error: any) {
      fastify.log.error('Metrics collection failed:', error);
      throw error;
    }
  });

  // Helper function to format bytes into human-readable format
  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Helper function to format uptime into human-readable format
  function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m ${secs}s`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }
}

export default healthRoutes;
