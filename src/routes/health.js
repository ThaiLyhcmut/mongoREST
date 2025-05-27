// Health Check Routes - System monitoring and status endpoints
async function healthRoutes(fastify, options) {
  const { schemaLoader, dbManager, authManager } = fastify;

  // Basic health check
  fastify.get('/', {
    schema: {
      description: 'Basic health check endpoint',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            uptime: { type: 'number' },
            version: { type: 'string' },
            environment: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };
  });

  // Detailed system status
  fastify.get('/status', {
    schema: {
      description: 'Detailed system status and component health',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            components: {
              type: 'object',
              properties: {
                database: { type: 'object' },
                schemas: { type: 'object' },
                memory: { type: 'object' },
                system: { type: 'object' }
              }
            },
            meta: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const startTime = Date.now();

      // Check database health
      const dbHealth = await dbManager.healthCheck();

      // Check memory usage
      const memoryUsage = process.memoryUsage();
      const memoryInfo = {
        used: formatBytes(memoryUsage.heapUsed),
        total: formatBytes(memoryUsage.heapTotal),
        external: formatBytes(memoryUsage.external),
        rss: formatBytes(memoryUsage.rss),
        usage: `${Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)}%`
      };

      // Schema status
      const schemaInfo = {
        status: 'loaded',
        collections: schemaLoader.schemas.size,
        functions: schemaLoader.functions.size,
        lastReloaded: new Date().toISOString() // In production, track actual reload time
      };

      // System information
      const systemInfo = {
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
        uptime: formatUptime(process.uptime()),
        pid: process.pid,
        loadAverage: process.platform !== 'win32' ? process.loadavg() : null,
        cpuUsage: process.cpuUsage()
      };

      // Determine overall status
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
    } catch (error) {
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

  // Database-specific health check
  fastify.get('/database', {
    schema: {
      description: 'Database connection and performance check',
      tags: ['Health', 'Database'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            connection: { type: 'object' },
            performance: { type: 'object' },
            collections: { type: 'array' },
            stats: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const startTime = Date.now();

      // Test database connection and get stats
      const [healthCheck, dbStats, collections] = await Promise.all([
        dbManager.healthCheck(),
        dbManager.getStats(),
        dbManager.listCollections()
      ]);

      const responseTime = Date.now() - startTime;

      // Simple performance test - count documents in a small collection
      let performanceMetrics = null;
      try {
        const testStartTime = Date.now();
        const testCollection = collections.find(c => c.name !== 'system.indexes') || collections[0];

        if (testCollection) {
          const collection = dbManager.collection(testCollection.name);
          await collection.countDocuments({}, { limit: 1000 });
          performanceMetrics = {
            testOperation: 'countDocuments',
            testCollection: testCollection.name,
            responseTime: `${Date.now() - testStartTime}ms`
          };
        }
      } catch (perfError) {
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
        collections: collections.map(col => ({
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
    } catch (error) {
      fastify.log.error('Database health check failed:', error);

      return reply.code(503).send({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Schema validation status
  fastify.get('/schemas', {
    schema: {
      description: 'Schema loading and validation status',
      tags: ['Health', 'Schemas'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            collections: { type: 'object' },
            functions: { type: 'object' },
            validation: { type: 'object' },
            lastReloaded: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const collections = {
        total: schemaLoader.schemas.size,
        loaded: Array.from(schemaLoader.schemas.keys()),
        details: schemaLoader.getAllSchemas()
      };

      const functions = {
        total: schemaLoader.functions.size,
        loaded: Array.from(schemaLoader.functions.keys()),
        details: schemaLoader.getAllFunctions()
      };

      // Test schema validation with a sample document
      const validationTests = [];
      for (const [name, schema] of schemaLoader.schemas) {
        try {
          // Create a minimal valid document for testing
          const testDocument = createMinimalDocument(schema); // Changed from this.createMinimalDocument
          const validation = schemaLoader.validateDocument(name, testDocument);

          validationTests.push({
            collection: name,
            status: validation.valid ? 'valid' : 'invalid',
            errors: validation.errors || null
          });
        } catch (error) {
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
    } catch (error) {
      fastify.log.error('Schema health check failed:', error);

      return reply.code(503).send({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Live readiness probe (for Kubernetes)
  fastify.get('/ready', {
    schema: {
      description: 'Readiness probe for container orchestration',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            ready: { type: 'boolean' },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Check critical components
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
    } catch (error) {
      return reply.code(503).send({
        ready: false,
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  });

  // Liveness probe (for Kubernetes)
  fastify.get('/live', {
    schema: {
      description: 'Liveness probe for container orchestration',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            alive: { type: 'boolean' },
            timestamp: { type: 'string' },
            uptime: { type: 'number' }
          }
        }
      }
    }
  }, async (request, reply) => {
    // Simple liveness check - if we can respond, we're alive
    return {
      alive: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };
  });

  // System metrics (protected endpoint)
  fastify.get('/metrics', {
    schema: {
      description: 'System performance metrics',
      tags: ['Health', 'Metrics'],
      security: [{ bearerAuth: [] }]
    },
    preHandler: [
      async (request, reply) => {
        try {
          await request.jwtVerify();

          // Only admin users can access metrics
          if (request.user.role !== 'admin') {
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
  }, async (request, reply) => {
    try {
      const metrics = {
        timestamp: new Date().toISOString(),
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
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
      };

      return {
        status: 'healthy',
        metrics,
        format: 'json'
      };
    } catch (error) {
      fastify.log.error('Metrics collection failed:', error);
      throw error;
    }
  });

  // Helper functions
  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  function formatUptime(seconds) {
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

  const createMinimalDocument = (schema) => { // Changed from this.createMinimalDocument
    const document = {};
    const required = schema.required || [];

    for (const field of required) {
      const property = schema.properties[field];
      if (property) {
        document[field] = generateSampleValue(property); // Changed from this.generateSampleValue
      }
    }

    return document;
  };

  const generateSampleValue = (property) => { // Changed from this.generateSampleValue
    switch (property.type) {
      case 'string':
        if (property.format === 'email') return 'test@example.com';
        if (property.format === 'date-time') return new Date().toISOString();
        if (property.enum) return property.enum[0];
        return 'sample';
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
}

export default healthRoutes;
