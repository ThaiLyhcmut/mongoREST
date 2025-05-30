// Health Route Configuration
// Configuration for health check and monitoring endpoints

export const healthRouteConfig = {
  basic: {
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
  },

  status: {
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
  },

  database: {
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
  },

  schemas: {
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
            lastReloaded: { type: 'string' },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  },

  ready: {
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
        },
        503: {
          type: 'object',
          properties: {
            ready: { type: 'boolean' },
            timestamp: { type: 'string' },
            reasons: { type: 'array' },
            error: { type: 'string' }
          }
        }
      }
    }
  },

  live: {
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
  },

  metrics: {
    schema: {
      description: 'System performance metrics',
      tags: ['Health', 'Metrics'],
      security: [{ bearerAuth: [] }]
    }
  }
};

// Type definitions for health check interfaces
export interface HealthCheckResponse {
  status: string;
  timestamp: string;
  uptime?: number;
  version?: string;
  environment?: string;
  responseTime?: string;
  components?: ComponentHealth;
  meta?: HealthMeta;
  error?: string;
}

export interface ComponentHealth {
  database?: DatabaseHealth;
  schemas?: SchemaHealth;
  memory?: MemoryInfo;
  system?: SystemInfo;
}

export interface DatabaseHealth {
  status: string;
  database?: string;
  host?: string;
  responseTime?: string;
  error?: string;
  connection?: ConnectionInfo;
  performance?: PerformanceMetrics;
  collections?: CollectionInfo[];
  stats?: DatabaseStats;
  server?: ServerInfo;
}

export interface SchemaHealth {
  status: string;
  collections: number;
  functions: number;
  lastReloaded: string;
}

export interface MemoryInfo {
  used: string;
  total: string;
  external: string;
  rss: string;
  usage: string;
}

export interface SystemInfo {
  nodeVersion: string;
  platform: string;
  architecture: string;
  uptime: string;
  pid: number;
  loadAverage?: number[] | null;
  cpuUsage: NodeJS.CpuUsage;
}

export interface ConnectionInfo {
  host?: string;
  port?: number;
  ssl?: boolean;
}

export interface PerformanceMetrics {
  testOperation?: string;
  testCollection?: string;
  responseTime?: string;
  error?: string;
  message?: string;
}

export interface CollectionInfo {
  name: string;
  type: string;
}

export interface DatabaseStats {
  name?: string;
  collections?: number;
  indexes?: number;
  dataSize?: number;
  storageSize?: number;
}

export interface ServerInfo {
  version: string;
  uptime?: number;
  connections?: {
    current: number;
    available: number;
  };
}

export interface HealthMeta {
  version: string;
  environment: string;
  service: string;
}

export interface SchemaValidationTest {
  collection: string;
  status: 'valid' | 'invalid' | 'error';
  errors?: any[] | null;
  error?: string;
}

export interface SchemaValidationResponse {
  status: string;
  collections: {
    total: number;
    loaded: string[];
    details: any;
  };
  functions: {
    total: number;
    loaded: string[];
    details: any;
  };
  validation: {
    totalTests: number;
    passed: number;
    failed: number;
    details: SchemaValidationTest[];
  };
  lastReloaded: string;
  timestamp: string;
}

export interface ReadinessResponse {
  ready: boolean;
  timestamp: string;
  reasons?: string[];
  error?: string;
}

export interface LivenessResponse {
  alive: boolean;
  timestamp: string;
  uptime: number;
}

export interface MetricsResponse {
  status: string;
  metrics: {
    timestamp: string;
    system: {
      uptime: number;
      memory: NodeJS.MemoryUsage;
      cpu: NodeJS.CpuUsage;
      platform: {
        node: string;
        platform: string;
        architecture: string;
      };
    };
    database: any;
    application: {
      collections: number;
      functions: number;
      environment: string | undefined;
    };
    performance: {
      requestCount: number;
      averageResponseTime: number;
      errorRate: number;
    };
  };
  format: string;
}

export interface PropertySchema {
  type: string;
  enum?: string[];
  minimum?: number;
}

export interface DocumentSchema {
  required?: string[];
  properties: { [key: string]: PropertySchema };
}