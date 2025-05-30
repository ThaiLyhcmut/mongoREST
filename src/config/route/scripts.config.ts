// Scripts Route Configuration
// Configuration for MongoDB script execution endpoints

export const scriptsRouteConfig = {
  execute: {
    schema: {
      description: 'Execute raw MongoDB script',
      tags: ['Scripts'],
      body: {
        oneOf: [
          {
            type: 'object',
            properties: {
              script: { 
                type: 'string',
                description: 'MongoDB shell script (e.g., "db.users.find({age: {$gte: 18}})")'
              },
              options: {
                type: 'object',
                properties: {
                  timeout: { type: 'integer' },
                  dryRun: { type: 'boolean' },
                  explain: { type: 'boolean' }
                }
              }
            },
            required: ['script']
          },
          {
            type: 'object',
            properties: {
              mongoScript: { 
                type: 'string',
                description: 'Alternative field name for MongoDB script'
              },
              options: { type: 'object' }
            },
            required: ['mongoScript']
          }
        ]
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {},
            script: {
              type: 'object',
              properties: {
                original: { type: 'string' },
                parsed: { type: 'string' },
                complexity: { type: 'integer' },
                collections: { type: 'array' }
              }
            },
            meta: {
              type: 'object',
              properties: {
                operation: { type: 'string' },
                collection: { type: 'string' },
                executionTime: { type: 'string' },
                dryRun: { type: 'boolean' }
              }
            }
          }
        }
      }
    },
    preHandler: [
      'authenticate',
      'parseMongoScript',
      'validateScript',
      'scriptRateLimit',
      'logScriptExecution',
      'analyzeScript'
    ]
  },

  batch: {
    schema: {
      description: 'Execute multiple MongoDB scripts in sequence',
      tags: ['Scripts'],
      body: {
        type: 'object',
        properties: {
          scripts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                script: { type: 'string' },
                options: { type: 'object' }
              },
              required: ['script']
            }
          },
          options: {
            type: 'object',
            properties: {
              atomic: { type: 'boolean', default: false },
              stopOnError: { type: 'boolean', default: true },
              timeout: { type: 'integer', default: 60000 }
            }
          }
        },
        required: ['scripts']
      }
    }
  },

  validate: {
    schema: {
      description: 'Validate MongoDB script syntax and permissions',
      tags: ['Scripts'],
      body: {
        type: 'object',
        properties: {
          script: { type: 'string' }
        },
        required: ['script']
      }
    }
  },

  history: {
    schema: {
      description: 'Get script execution history for current user',
      tags: ['Scripts'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          page: { type: 'integer', minimum: 1, default: 1 },
          operation: { type: 'string' },
          collection: { type: 'string' },
          success: { type: 'boolean' }
        }
      }
    }
  }
};

// Type definitions for script-related interfaces
export interface ScriptOptions {
  timeout?: number;
  dryRun?: boolean;
  explain?: boolean;
  session?: any;
}

export interface ScriptBody {
  script?: string;
  mongoScript?: string;
  options?: ScriptOptions;
}

export interface BatchScriptData {
  id?: string;
  script: string;
  options?: ScriptOptions;
}

export interface BatchScriptBody {
  scripts: BatchScriptData[];
  options?: {
    atomic?: boolean;
    stopOnError?: boolean;
    timeout?: number;
  };
}

export interface ParsedScript {
  collection: string;
  operation: string;
  params: any;
  meta: {
    originalScript: string;
    complexity: number;
    collections: string[];
  };
}

export interface ScriptExecutionResult {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
  script: string;
  complexity?: number;
}

export interface PermissionCheck {
  collection: string;
  operation: string;
  hasAccess: boolean;
  reason?: string | null;
}

export interface ScriptHistoryQuery {
  limit?: number;
  page?: number;
  operation?: string;
  collection?: string;
  success?: boolean;
}

export interface ScriptHistoryItem {
  id: string;
  script: string;
  operation: string;
  collection: string;
  executedAt: string;
  executedBy: string;
  success: boolean;
  executionTime: number;
  complexity: number;
  recordsAffected: number;
}