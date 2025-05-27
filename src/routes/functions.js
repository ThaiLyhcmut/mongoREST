// Function Routes - Execute custom functions defined in JSON schemas
async function functionRoutes(fastify, options) {
  const { authManager, functionExecutor } = fastify;

  // Register authentication and authorization decorators
  fastify.decorate('authenticate', authManager.authenticate());
  fastify.decorate('authorizeFunction', authManager.authorizeFunction.bind(authManager));

  // List all available functions
  fastify.get('/', {
    schema: {
      description: 'List all available custom functions',
      tags: ['Functions'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            functions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  method: { type: 'string' },
                  endpoint: { type: 'string' },
                  category: { type: 'string' },
                  permissions: { type: 'array' },
                  rateLimits: { type: 'object' },
                  steps: { type: 'integer' },
                  inputSchema: { type: 'object' },
                  outputSchema: { type: 'object' }
                }
              }
            },
            meta: {
              type: 'object',
              properties: {
                totalFunctions: { type: 'integer' },
                categories: { type: 'array' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const functions = [];
      const categories = new Set();

      for (const [name, func] of fastify.schemaLoader.functions) {
        categories.add(func.category || 'general');

        functions.push({
          name,
          description: func.description,
          method: func.method,
          endpoint: func.endpoint || `/functions/${name}`,
          category: func.category || 'general',
          version: func.version || '1.0.0',
          permissions: func.permissions || [],
          rateLimits: func.rateLimits || {},
          steps: func.steps.length,
          inputSchema: func.input || null,
          outputSchema: func.output || null,
          timeout: func.timeout || parseInt(process.env.FUNCTION_TIMEOUT) || 30000,
          caching: func.caching || null,
          hooks: Object.keys(func.hooks || {})
        });
      }

      return {
        success: true,
        functions,
        meta: {
          totalFunctions: functions.length,
          categories: Array.from(categories),
          documentation: '/docs'
        }
      };
    } catch (error) {
      fastify.log.error('Failed to list functions:', error);
      throw error;
    }
  });

  // Get specific function details
  fastify.get('/:functionName', {
    schema: {
      description: 'Get detailed information about a specific function',
      tags: ['Functions'],
      params: {
        type: 'object',
        properties: {
          functionName: { type: 'string' }
        },
        required: ['functionName']
      }
    }
  }, async (request, reply) => {
    try {
      const { functionName } = request.params;
      const functionDef = fastify.schemaLoader.getFunction(functionName);

      if (!functionDef) {
        return reply.code(404).send({
          error: 'Function not found',
          message: `Function '${functionName}' does not exist`
        });
      }

      return {
        success: true,
        function: {
          ...functionDef,
          // Add runtime information
          stepTypes: functionDef.steps.map(step => step.type),
          collections: [...new Set(functionDef.steps
            .filter(step => step.collection)
            .map(step => step.collection))],
          estimatedExecutionTime: estimateExecutionTime(functionDef)
        },
        meta: {
          lastModified: new Date().toISOString()
        }
      };
    } catch (error) {
      fastify.log.error('Failed to get function details:', error);
      throw error;
    }
  });

  // Execute function - generic endpoint
  fastify.post('/:functionName', {
    schema: {
      description: 'Execute a custom function',
      tags: ['Functions'],
      params: {
        type: 'object',
        properties: {
          functionName: { type: 'string' }
        },
        required: ['functionName']
      },
      body: {
        type: 'object',
        description: 'Function input parameters'
      }
    },
    preHandler: async (request, reply) => {
      // Authenticate first
      await fastify.authenticate(request, reply);

      // Then authorize function access
      await fastify.authorizeFunction(request.params.functionName)(request, reply);

      // Apply function-specific rate limiting
      await applyFunctionRateLimit(request, reply);
    }
  }, async (request, reply) => {
    try {
      const { functionName } = request.params;
      const params = request.body || {};

      const functionDef = fastify.schemaLoader.getFunction(functionName);
      if (!functionDef) {
        return reply.code(404).send({
          error: 'Function not found',
          message: `Function '${functionName}' does not exist`
        });
      }

      // Check if HTTP method matches function definition
      if (functionDef.method && functionDef.method.toUpperCase() !== request.method) {
        return reply.code(405).send({
          error: 'Method not allowed',
          message: `Function '${functionName}' requires ${functionDef.method} method`,
          allowedMethod: functionDef.method
        });
      }

      // Execute function with context
      const context = {
        user: request.user,
        config: {
          // Add any configuration needed for function execution
        },
        request: {
          ip: request.ip,
          userAgent: request.headers['user-agent']
        }
      };

      const result = await functionExecutor.executeFunction(functionName, params, context);

      // Log function execution
      fastify.log.info(`Function executed: ${functionName}`, {
        user: request.user.sub,
        success: result.success,
        executionTime: result.meta?.executionTime
      });

      return result;
    } catch (error) {
      fastify.log.error(`Function execution failed: ${request.params.functionName}`, error);
      throw error;
    }
  });

  // Category-based function routes
  fastify.register(async (fastify) => {
    // Analytics functions
    fastify.register(async (fastify) => {
      // Auto-register analytics functions
      await registerCategoryFunctions(fastify, 'analytics');
    }, { prefix: '/analytics' });

    // Integration functions
    fastify.register(async (fastify) => {
      await registerCategoryFunctions(fastify, 'integrations');
    }, { prefix: '/integrations' });

    // Report functions
    fastify.register(async (fastify) => {
      await registerCategoryFunctions(fastify, 'reports');
    }, { prefix: '/reports' });
  });

  // Function execution history (for monitoring)
  fastify.get('/history/:functionName', {
    schema: {
      description: 'Get execution history for a function',
      tags: ['Functions', 'Monitoring'],
      params: {
        type: 'object',
        properties: {
          functionName: { type: 'string' }
        },
        required: ['functionName']
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          page: { type: 'integer', minimum: 1, default: 1 }
        }
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const { functionName } = request.params;
      const { limit = 20, page = 1 } = request.query;

      // This would typically come from a logging/monitoring database
      // For now, return mock data
      const mockHistory = Array.from({ length: limit }, (_, i) => ({
        id: `exec_${Date.now()}_${i}`,
        functionName,
        executedBy: request.user.sub,
        executedAt: new Date(Date.now() - i * 3600000).toISOString(),
        status: Math.random() > 0.1 ? 'success' : 'failed',
        executionTime: Math.floor(Math.random() * 5000) + 500,
        inputParams: { /* sanitized input */ },
        error: Math.random() > 0.9 ? 'Sample error message' : null
      }));

      return {
        success: true,
        history: mockHistory,
        meta: {
          functionName,
          page,
          limit,
          totalCount: 150, // Mock total
          hasNext: page * limit < 150,
          hasPrevious: page > 1
        }
      };
    } catch (error) {
      fastify.log.error('Failed to get function history:', error);
      throw error;
    }
  });

  // Function performance metrics
  fastify.get('/metrics/:functionName', {
    schema: {
      description: 'Get performance metrics for a function',
      tags: ['Functions', 'Monitoring'],
      params: {
        type: 'object',
        properties: {
          functionName: { type: 'string' }
        },
        required: ['functionName']
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const { functionName } = request.params;

      const functionDef = fastify.schemaLoader.getFunction(functionName);
      if (!functionDef) {
        return reply.code(404).send({
          error: 'Function not found',
          message: `Function '${functionName}' does not exist`
        });
      }

      // Mock metrics - in production, this would come from monitoring system
      const metrics = {
        totalExecutions: Math.floor(Math.random() * 1000) + 100,
        successRate: 0.95 + Math.random() * 0.05,
        averageExecutionTime: Math.floor(Math.random() * 2000) + 500,
        peakExecutionTime: Math.floor(Math.random() * 5000) + 2000,
        lastExecuted: new Date(Date.now() - Math.random() * 86400000).toISOString(),
        errorRate: Math.random() * 0.05,
        commonErrors: [
          'Timeout exceeded',
          'Database connection failed',
          'Invalid input parameters'
        ],
        hourlyStats: Array.from({ length: 24 }, (_, i) => ({
          hour: i,
          executions: Math.floor(Math.random() * 50),
          avgTime: Math.floor(Math.random() * 1000) + 300
        }))
      };

      return {
        success: true,
        function: functionName,
        metrics,
        meta: {
          collectedAt: new Date().toISOString(),
          period: '24h'
        }
      };
    } catch (error) {
      fastify.log.error('Failed to get function metrics:', error);
      throw error;
    }
  });

  // Helper functions
  async function registerCategoryFunctions(fastify, category) {
    for (const [name, func] of fastify.schemaLoader.functions) {
      if (func.category === category) {
        const routePath = `/${func.name.replace(/([A-Z])/g, '-$1').toLowerCase()}`;

        fastify.route({
          method: func.method || 'POST',
          url: routePath,
          schema: {
            description: func.description,
            tags: [category, 'Functions'],
            body: func.input || { type: 'object' },
            response: {
              200: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  result: func.output || { type: 'object' },
                  meta: { type: 'object' }
                }
              }
            }
          },
          preHandler: [
            fastify.authenticate,
            fastify.authorizeFunction(name),
            async (request, reply) => await applyFunctionRateLimit(request, reply)
          ],
          handler: async (request, reply) => {
            const context = {
              user: request.user,
              config: {},
              request: {
                ip: request.ip,
                userAgent: request.headers['user-agent']
              }
            };

            return await functionExecutor.executeFunction(name, request.body || {}, context);
          }
        });
      }
    }
  }

  async function applyFunctionRateLimit(request, reply) {
    const functionName = request.params.functionName
                        || extractFunctionNameFromRoute(request.routerPath);

    if (!functionName) return;

    const functionDef = fastify.schemaLoader.getFunction(functionName);
    if (!functionDef?.rateLimits) return;

    const userRateLimit = authManager.getRateLimit(request.user);
    const functionRateLimit = functionDef.rateLimits;

    // Apply the more restrictive rate limit
    const effectiveLimit = Math.min(
      userRateLimit.requests,
      functionRateLimit.requests || Infinity
    );

    // Simple rate limiting implementation
    // In production, use Redis or similar for distributed rate limiting
    const key = `ratelimit:function:${functionName}:${request.user.sub}`;
    const window = parseTimeWindow(functionRateLimit.window || '1h');

    // This is a simplified implementation
    // Real implementation would use proper rate limiting with Redis
    request.rateLimit = {
      max: effectiveLimit,
      timeWindow: window
    };
  }

  function extractFunctionNameFromRoute(routePath) {
    const match = routePath.match(/\/functions\/([^\/]+)/);
    return match ? match[1] : null;
  }

  function parseTimeWindow(window) {
    const match = window.match(/^(\d+)([smhd])$/);
    if (!match) return 3600000; // Default 1 hour

    const [, value, unit] = match;
    const multipliers = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000
    };

    return parseInt(value) * multipliers[unit];
  }

  const estimateExecutionTime = (functionDef) => {
    // Simple estimation based on step types and count
    const stepTypeWeights = {
      find: 100,
      findOne: 50,
      insertOne: 200,
      insertMany: 500,
      updateOne: 150,
      updateMany: 300,
      deleteOne: 100,
      deleteMany: 200,
      aggregate: 500,
      transform: 100,
      http: 1000,
      condition: 50
    };

    let estimatedTime = 0;
    for (const step of functionDef.steps) {
      estimatedTime += stepTypeWeights[step.type] || 100;
    }

    return `${estimatedTime}ms`;
  };
}

export default functionRoutes;
