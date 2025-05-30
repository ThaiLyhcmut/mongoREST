// Functions Route Configuration
// Configuration for custom function execution endpoints

export const functionsRouteConfig = {
  list: {
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
  },

  details: {
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
  },

  execute: {
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
    }
  },

  history: {
    schema: {
      description: 'Get function execution history',
      tags: ['Functions'],
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
          page: { type: 'integer', minimum: 1, default: 1 },
          status: { type: 'string', enum: ['success', 'failed'] }
        }
      }
    }
  },

  metrics: {
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
    }
  },

  categoryFunctions: {
    schema: {
      description: 'Category-specific function execution',
      tags: ['Functions'],
      body: { type: 'object' },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            result: { type: 'object' },
            meta: { type: 'object' }
          }
        }
      }
    }
  }
};

// Type definitions for function routes
export interface FunctionDefinition {
  name: string;
  description: string;
  method: string;
  endpoint?: string;
  category?: string;
  version?: string;
  permissions?: string[];
  rateLimits?: RateLimitConfig;
  steps: FunctionStep[];
  input?: any;
  output?: any;
  timeout?: number;
  caching?: any;
  hooks?: { [key: string]: any };
}

export interface FunctionStep {
  id: string;
  type: string;
  collection?: string;
  [key: string]: any;
}

export interface RateLimitConfig {
  requests?: number;
  window?: string;
}

export interface FunctionListResponse {
  success: boolean;
  functions: FunctionSummary[];
  meta: {
    totalFunctions: number;
    categories: string[];
    documentation?: string;
  };
}

export interface FunctionSummary {
  name: string;
  description: string;
  method: string;
  endpoint: string;
  category: string;
  version: string;
  permissions: string[];
  rateLimits: RateLimitConfig;
  steps: number;
  inputSchema: any;
  outputSchema: any;
  timeout: number;
  caching: any;
  hooks: string[];
}

export interface FunctionDetailsResponse {
  success: boolean;
  function: FunctionDefinition & {
    stepTypes: string[];
    collections: string[];
    estimatedExecutionTime: string;
  };
  meta: {
    lastModified: string;
  };
}

export interface FunctionExecutionContext {
  user: any;
  config: any;
  request: {
    ip: string;
    userAgent?: string;
  };
}

export interface FunctionHistoryItem {
  id: string;
  functionName: string;
  executedBy: string;
  executedAt: string;
  status: 'success' | 'failed';
  executionTime: number;
  inputParams: any;
  error?: string | null;
}

export interface FunctionHistoryResponse {
  success: boolean;
  history: FunctionHistoryItem[];
  meta: {
    functionName: string;
    page: number;
    limit: number;
    totalCount: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

export interface FunctionRouteParams {
  functionName: string;
}

export interface FunctionMetrics {
  totalExecutions: number;
  successRate: number;
  averageExecutionTime: number;
  peakExecutionTime: number;
  lastExecuted: string;
  errorRate: number;
  commonErrors: string[];
  hourlyStats: Array<{
    hour: number;
    executions: number;
    avgTime: number;
  }>;
}

export interface FunctionMetricsResponse {
  success: boolean;
  function: string;
  metrics: FunctionMetrics;
  meta: {
    collectedAt: string;
    period: string;
  };
}