// Function Routes - Execute custom functions defined in JSON schemas
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  functionsRouteConfig,
  FunctionDefinition,
  FunctionStep,
  RateLimitConfig,
  FunctionListResponse,
  FunctionSummary,
  FunctionDetailsResponse,
  FunctionExecutionContext,
  FunctionHistoryItem,
  FunctionHistoryResponse,
  FunctionRouteParams,
  FunctionMetrics,
  FunctionMetricsResponse
} from '../config/route/functions.config';

interface FunctionHistoryQuery {
  limit?: number;
  page?: number;
}

async function functionRoutes(fastify: FastifyInstance, options: any): Promise<void> {
  const { schemaLoader, dbManager, authManager, functionExecutor } = fastify as any;

  // Register authentication and authorization decorators
  fastify.decorate('authenticate', authManager.authenticate());
  fastify.decorate('authorizeFunction', authManager.authorizeFunction.bind(authManager));
  // List all available functions endpoint
  fastify.get<{ Reply: FunctionListResponse }>('/', functionsRouteConfig.list, async (request: FastifyRequest, reply: FastifyReply): Promise<FunctionListResponse> => {
    try {
      const functions: FunctionSummary[] = [];
      const categories = new Set<string>();

      for (const [name, func] of schemaLoader.functions) {
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
          timeout: func.timeout || parseInt(process.env.FUNCTION_TIMEOUT || '30000'),
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
    } catch (error: any) {
      fastify.log.error('Failed to list functions:', error);
      throw error;
    }
  });
  // Get specific function details endpoint
  fastify.get<{ Params: FunctionRouteParams; Reply: FunctionDetailsResponse }>('/:functionName', functionsRouteConfig.details, async (request: FastifyRequest<{ Params: FunctionRouteParams }>, reply: FastifyReply): Promise<FunctionDetailsResponse> => {
    try {
      const { functionName } = request.params;
      const functionDef = schemaLoader.getFunction(functionName);

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
          stepTypes: functionDef.steps.map((step: FunctionStep) => step.type),
          collections: [...new Set(functionDef.steps
            .filter((step: FunctionStep) => step.collection)
            .map((step: FunctionStep) => step.collection))],
          estimatedExecutionTime: estimateExecutionTime(functionDef)
        },
        meta: {
          lastModified: new Date().toISOString()
        }
      };
    } catch (error: any) {
      fastify.log.error('Failed to get function details:', error);
      throw error;
    }
  });  // Execute function - generic endpoint
  fastify.post<{ Params: FunctionRouteParams; Body: any }>('/:functionName', {
    ...functionsRouteConfig.execute,
    preHandler: async (request: FastifyRequest<{ Params: FunctionRouteParams }>, reply: FastifyReply) => {
      // Authenticate first
      await (fastify as any).authenticate(request, reply);
      
      // Then authorize function access
      await (fastify as any).authorizeFunction(request.params.functionName)(request, reply);
      
      // Apply function-specific rate limiting
      await applyFunctionRateLimit(request, reply);
    }
  }, async (request: FastifyRequest<{ Params: FunctionRouteParams; Body: any }>, reply: FastifyReply) => {
    try {
      const { functionName } = request.params;
      const params = request.body || {};

      const functionDef = schemaLoader.getFunction(functionName);
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
      const context: FunctionExecutionContext = {
        user: (request as any).user,
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
        user: (request as any).user.sub,
        success: result.success,
        executionTime: result.meta?.executionTime
      });

      return result;

    } catch (error: any) {
      fastify.log.error(`Function execution failed: ${request.params.functionName}`, error);
      throw error;
    }
  });

  // Category-based function routes
  fastify.register(async function(fastify: FastifyInstance) {
    // Analytics functions
    fastify.register(async function(fastify: FastifyInstance) {
      // Auto-register analytics functions
      await registerCategoryFunctions(fastify, 'analytics');
    }, { prefix: '/analytics' });

    // Integration functions  
    fastify.register(async function(fastify: FastifyInstance) {
      await registerCategoryFunctions(fastify, 'integrations');
    }, { prefix: '/integrations' });

    // Report functions
    fastify.register(async function(fastify: FastifyInstance) {
      await registerCategoryFunctions(fastify, 'reports');
    }, { prefix: '/reports' });
  });

  // Function execution history endpoint (for monitoring)
  fastify.get<{ 
    Params: FunctionRouteParams; 
    Querystring: FunctionHistoryQuery;
    Reply: FunctionHistoryResponse;  }>('/history/:functionName', {
    ...functionsRouteConfig.history,
    preHandler: [(fastify as any).authenticate]
  }, async (request: FastifyRequest<{
    Params: FunctionRouteParams; 
    Querystring: FunctionHistoryQuery;
  }>, reply: FastifyReply): Promise<FunctionHistoryResponse> => {
    try {
      const { functionName } = request.params;
      const { limit = 20, page = 1 } = request.query;

      // This would typically come from a logging/monitoring database
      // For now, return mock data
      const mockHistory: FunctionHistoryItem[] = Array.from({ length: limit }, (_, i) => ({
        id: `exec_${Date.now()}_${i}`,
        functionName,
        executedBy: (request as any).user.sub,
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
    } catch (error: any) {
      fastify.log.error('Failed to get function history:', error);
      throw error;
    }
  });

  // Function performance metrics endpoint
  fastify.get<{ 
    Params: FunctionRouteParams; 
    Reply: FunctionMetricsResponse;  }>('/metrics/:functionName', {
    ...functionsRouteConfig.metrics,
    preHandler: [(fastify as any).authenticate]
  }, async (request: FastifyRequest<{ Params: FunctionRouteParams }>, reply: FastifyReply): Promise<FunctionMetricsResponse> => {
    try {
      const { functionName } = request.params;
      
      const functionDef = schemaLoader.getFunction(functionName);
      if (!functionDef) {
        return reply.code(404).send({
          error: 'Function not found',
          message: `Function '${functionName}' does not exist`
        });
      }

      // Mock metrics - in production, this would come from monitoring system
      const metrics: FunctionMetrics = {
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
    } catch (error: any) {
      fastify.log.error('Failed to get function metrics:', error);
      throw error;
    }
  });

  // Helper function to register category-specific functions
  async function registerCategoryFunctions(fastify: FastifyInstance, category: string): Promise<void> {
    for (const [name, func] of (fastify as any).schemaLoader.functions) {
      if (func.category === category) {
        const routePath = `/${func.name.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
          fastify.route({
          method: func.method || 'POST',
          url: routePath,
          ...functionsRouteConfig.categoryFunctions,
          preHandler: [
            (fastify as any).authenticate,
            (fastify as any).authorizeFunction(name),
            async (request: FastifyRequest, reply: FastifyReply) => await applyFunctionRateLimit(request, reply)
          ],
          handler: async (request: FastifyRequest, reply: FastifyReply) => {
            const context: FunctionExecutionContext = {
              user: (request as any).user,
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

  // Helper function to apply function-specific rate limiting
  async function applyFunctionRateLimit(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const functionName = (request as any).params?.functionName || 
                        extractFunctionNameFromRoute(request.routerPath);
    
    if (!functionName) return;

    const functionDef = (fastify as any).schemaLoader.getFunction(functionName);
    if (!functionDef?.rateLimits) return;

    const userRateLimit = authManager.getRateLimit((request as any).user);
    const functionRateLimit = functionDef.rateLimits;

    // Apply the more restrictive rate limit
    const effectiveLimit = Math.min(
      userRateLimit.requests,
      functionRateLimit.requests || Infinity
    );

    // Simple rate limiting implementation
    // In production, use Redis or similar for distributed rate limiting
    const key = `ratelimit:function:${functionName}:${(request as any).user.sub}`;
    const window = parseTimeWindow(functionRateLimit.window || '1h');
    
    // This is a simplified implementation
    // Real implementation would use proper rate limiting with Redis
    (request as any).rateLimit = {
      max: effectiveLimit,
      timeWindow: window
    };
  }

  // Helper function to extract function name from route path
  function extractFunctionNameFromRoute(routePath: string): string | null {
    const match = routePath.match(/\/functions\/([^\/]+)/);
    return match ? match[1] : null;
  }

  // Helper function to parse time window strings (e.g., "1h", "30m")
  function parseTimeWindow(window: string): number {
    const match = window.match(/^(\d+)([smhd])$/);
    if (!match) return 3600000; // Default 1 hour

    const [, value, unit] = match;
    const multipliers: { [key: string]: number } = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000
    };

    return parseInt(value) * multipliers[unit];
  }

  // Helper function to estimate function execution time based on steps
  function estimateExecutionTime(functionDef: FunctionDefinition): string {
    // Simple estimation based on step types and count
    const stepTypeWeights: { [key: string]: number } = {
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
  }
}

export default functionRoutes;
