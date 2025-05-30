import { FastifySchema } from 'fastify';
import { RateLimitConfig } from '../core/relationship-parser.config';

// Collection information interfaces
export interface CollectionInfo {
  name: string;
  title: string;
  description: string;
  collection: string;
  endpoints: CollectionEndpoints;
  permissions: CollectionPermissions;
  indexes: CollectionIndex[];
  properties: number;
  required: number;
  searchFields?: string[];
  defaultSort?: { [key: string]: 'asc' | 'desc' };
  limits?: {
    default: number;
    max: number;
  };
  meta?: {
    version: string;
    lastModified: string;
    propertyCount: number;
  };
  validationRules?: ValidationRule[];
  relationships?: {
    outgoing: RelationshipInfo[];
    incoming: RelationshipInfo[];
  };
  rateLimits?: {
      [operation: string]: RateLimitConfig;
    };
}

export interface CollectionEndpoints {
  list: string;
  get: string;
  create: string;
  update: string;
  replace: string;
  delete: string;
}

export interface CollectionPermissions {
  read: string[];
  create: string[];
  update: string[];
  delete: string[];
}

export interface CollectionIndex {
  name: string;
  fields: string[];
  unique: boolean;
  sparse: boolean;
  background?: boolean;
  partialFilterExpression?: any;
  expireAfterSeconds?: number;
}

export interface CollectionMeta {
  totalCollections: number;
  availableOperations: string[];
  documentation: string;
}

// Collection stats interface (used in /:collection/stats route)
export interface CollectionStats {
  totalDocuments: number;
  estimatedSize: string;
  avgDocumentSize: string;
  indexes: number;
  indexDetails: Array<{
    name: string;
    keys: any;
    unique: boolean;
    sparse: boolean;
  }>;
}

// Bulk operations interfaces (used in /bulk route)
export interface BulkOperationItem {
  collection: string;
  operation: 'insertOne' | 'insertMany' | 'updateOne' | 'updateMany' | 'deleteOne' | 'deleteMany';
  data: any;
}

export interface BulkOperationsRequest {
  operations: BulkOperationItem[];
  atomic?: boolean;
}

export interface BulkOperationResult {
  index: number;
  success: boolean;
  operation: string;
  collection: string;
  result?: any;
  error?: string;
}

export interface BulkOperationsResponse {
  success: boolean;
  results: BulkOperationResult[];
  meta: {
    totalOperations: number;
    successCount: number;
    failureCount: number;
    atomic: boolean;
  };
}

// Aggregation interfaces (used in /:collection/aggregate route)
export interface AggregationRequest {
  pipeline: any[];
  options?: {
    maxTimeMS?: number;
    allowDiskUse?: boolean;
    cursor?: {
      batchSize?: number;
    };
    hint?: string | { [field: string]: 1 | -1 };
    readPreference?: string;
    readConcern?: {
      level: string;
    };
    collation?: {
      locale: string;
      [key: string]: any;
    };
    [key: string]: any;
  };
}

export interface AggregationResponse {
  success: boolean;
  data: any[];
  meta: {
    collection: string;
    operation: string;
    pipelineStages: number;
    hasWriteStages: boolean;
    executionTime: string;
  };
}

// Pipeline validation result interface (used by validationManager.validateAggregationPipeline)
export interface PipelineValidationResult {
  hasWriteStages: boolean;
  writeStages?: string[];
  isValid: boolean;
  errors?: string[];
  warnings?: string[];
}

export interface RelationshipInfo {
  field: string;
  type: string;
  targetCollection: string;
  foreignKey: string;
  localKey: string;
  multiple: boolean;
  required: boolean;
  cascade: boolean;
}

export interface SchemaProperty {
  type: string;
  description?: string;
  required: boolean;
  format?: string;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
  default?: any;
}

export interface ValidationRule {
  type: string;
  rule: string;
  message: string;
}

// Response interfaces
export interface CollectionListResponse {
  success: boolean;
  collections: CollectionInfo[];
  meta: CollectionMeta;
}

export interface CollectionSchemaResponse {
  success: boolean;
  collection: string;
  schema: any; // Updated to match crud.ts usage
  meta: {
    schemaVersion: string;
    lastModified: string;
  };
}

export interface CollectionStatsResponse {
  success: boolean;
  collection: string;
  stats: CollectionStats;
  schema: {
    title: string;
    requiredFields: string[];
    totalProperties: number;
  };
  meta: {
    lastUpdated: string;
  };
}

export interface CollectionRelationshipsResponse {
  success: boolean;
  collection: string;
  relationships: {
    outgoing: RelationshipInfo[];
    incoming: RelationshipInfo[];
  };
  meta: {
    totalRelationships: number;
    outgoingCount: number;
    incomingCount: number;
  };
}

export interface CollectionIndexesResponse {
  success: boolean;
  collection: string;
  indexes: CollectionIndex[];
  meta: {
    totalIndexes: number;
    totalIndexSize: number;
    collectedAt: string;
  };
}

export interface CollectionValidationResponse {
  success: boolean;
  collection: string;
  validation: {
    schemaValid: boolean;
    schemaErrors: string[];
    sampleValidation: {
      documentsChecked: number;
      validDocuments: number;
      invalidDocuments: number;
      errors: string[];
    };
    recommendations: string[];
  };
  meta: {
    validatedAt: string;
    schemaVersion: string;
  };
}

// Extended FastifyInstance interface (used in crud.ts)
export interface ExtendedFastifyInstance {
  schemaLoader: {
    schemas: Map<string, any>;
    getSchema: (name: string) => any;
  };
  dbManager: {
    collection: (name: string) => any;
    formatBytes: (bytes: number) => string;
    withTransaction: (callback: (session: any) => Promise<void>) => Promise<void>;
    aggregate: (collection: string, pipeline: any[], options?: any) => Promise<any[]>;
  };
  authManager: {
    canAccessCollection: (user: any, collection: string, operation: string) => boolean;
  };
  validationManager: {
    validateAggregationPipeline: (pipeline: any[]) => PipelineValidationResult;
  };
  crudGenerator: {
    registerRoutes: (fastify: any) => Promise<void>;
  };
  authenticate: any;
  authorizeCollection: (operation: string) => any;
  validateMethodOperation: () => any;
}

// Database operation error interfaces
export interface DatabaseOperationError {
  error: string;
  message: string;
  collection?: string;
  operation?: string;
  code?: number;
}

// User context interface (used in request.user)
export interface UserContext {
  sub: string;
  role: string;
  permissions: string[];
  [key: string]: any;
}

// Route configuration schemas
export const crudRouteConfig = {
  list: {
    description: 'List all available collections with metadata',
    tags: ['Collections'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          collections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                collection: { type: 'string' },
                endpoints: {
                  type: 'object',
                  properties: {
                    list: { type: 'string' },
                    get: { type: 'string' },
                    create: { type: 'string' },
                    update: { type: 'string' },
                    replace: { type: 'string' },
                    delete: { type: 'string' }
                  }
                },
                permissions: {
                  type: 'object',
                  properties: {
                    read: { type: 'array', items: { type: 'string' } },
                    create: { type: 'array', items: { type: 'string' } },
                    update: { type: 'array', items: { type: 'string' } },
                    delete: { type: 'array', items: { type: 'string' } }
                  }
                },
                indexes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      fields: { type: 'array', items: { type: 'string' } },
                      unique: { type: 'boolean' },
                      sparse: { type: 'boolean' }
                    }
                  }
                },
                properties: { type: 'number' },
                required: { type: 'number' },
                searchFields: { type: 'array', items: { type: 'string' } },
                defaultSort: { type: 'object' },
                limits: {
                  type: 'object',
                  properties: {
                    default: { type: 'number' },
                    max: { type: 'number' }
                  }
                },
                rateLimits: { type: 'object' }
              }
            }
          },
          meta: {
            type: 'object',
            properties: {
              totalCollections: { type: 'number' },
              availableOperations: { type: 'array', items: { type: 'string' } },
              documentation: { type: 'string' }
            }
          }
        }
      }
    }
  } as FastifySchema,

  schema: {
    description: 'Get JSON schema for a specific collection',
    tags: ['Collections'],
    params: {
      type: 'object',
      properties: {
        collection: { type: 'string' }
      },
      required: ['collection']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          collection: { type: 'string' },
          schema: { type: 'object' },
          meta: {
            type: 'object',
            properties: {
              schemaVersion: { type: 'string' },
              lastModified: { type: 'string' }
            }
          }
        }
      },
      404: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  stats: {
    description: 'Get statistics for a specific collection',
    tags: ['Collections'],
    params: {
      type: 'object',
      properties: {
        collection: { type: 'string' }
      },
      required: ['collection']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          collection: { type: 'string' },
          stats: {
            type: 'object',
            properties: {
              totalDocuments: { type: 'number' },
              estimatedSize: { type: 'string' },
              avgDocumentSize: { type: 'string' },
              indexes: { type: 'number' },
              indexDetails: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    keys: { type: 'object' },
                    unique: { type: 'boolean' },
                    sparse: { type: 'boolean' }
                  }
                }
              }
            }
          },
          schema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              requiredFields: { type: 'array', items: { type: 'string' } },
              totalProperties: { type: 'number' }
            }
          },
          meta: {
            type: 'object',
            properties: {
              lastUpdated: { type: 'string' }
            }
          }
        }
      },
      404: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  bulk: {
    description: 'Execute bulk operations across multiple collections',
    tags: ['Bulk Operations'],
    body: {
      type: 'object',
      properties: {
        operations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              collection: { type: 'string' },
              operation: { 
                type: 'string',
                enum: ['insertOne', 'insertMany', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany']
              },
              data: { type: 'object' }
            },
            required: ['collection', 'operation']
          }
        },
        atomic: { type: 'boolean', default: false }
      },
      required: ['operations']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                index: { type: 'number' },
                success: { type: 'boolean' },
                operation: { type: 'string' },
                collection: { type: 'string' },
                result: { type: 'object' },
                error: { type: 'string' }
              }
            }
          },
          meta: {
            type: 'object',
            properties: {
              totalOperations: { type: 'number' },
              successCount: { type: 'number' },
              failureCount: { type: 'number' },
              atomic: { type: 'boolean' }
            }
          }
        }
      },
      403: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  aggregate: {
    description: 'Execute aggregation pipeline on collection',
    tags: ['Aggregation'],
    params: {
      type: 'object',
      properties: {
        collection: { type: 'string' }
      },
      required: ['collection']
    },
    body: {
      type: 'object',
      properties: {
        pipeline: { 
          type: 'array',
          items: { type: 'object' }
        },
        options: { 
          type: 'object',
          properties: {
            maxTimeMS: { type: 'number' },
            allowDiskUse: { type: 'boolean' },
            cursor: {
              type: 'object',
              properties: {
                batchSize: { type: 'number' }
              }
            },
            hint: { 
              oneOf: [
                { type: 'string' },
                { type: 'object' }
              ]
            },
            readPreference: { type: 'string' },
            readConcern: {
              type: 'object',
              properties: {
                level: { type: 'string' }
              }
            },
            collation: {
              type: 'object',
              properties: {
                locale: { type: 'string' }
              }
            }
          }
        }
      },
      required: ['pipeline']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: { type: 'array' },
          meta: {
            type: 'object',
            properties: {
              collection: { type: 'string' },
              operation: { type: 'string' },
              pipelineStages: { type: 'number' },
              hasWriteStages: { type: 'boolean' },
              executionTime: { type: 'string' }
            }
          }
        }
      },
      400: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' }
        }
      },
      404: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  validation: {
    description: 'Validate collection schema and sample documents',
    tags: ['Collections'],
    params: {
      type: 'object',
      properties: {
        collection: { type: 'string' }
      },
      required: ['collection']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          collection: { type: 'string' },
          validation: { type: 'object' },
          meta: {
            type: 'object',
            properties: {
              validatedAt: { type: 'string' },
              schemaVersion: { type: 'string' }
            }
          }
        }
      }
    }
  } as FastifySchema
};

// Export utility types for external use
export type {
  CollectionInfo as CrudCollectionInfo,
  CollectionStats as CrudCollectionStats,
  BulkOperationItem as CrudBulkOperationItem,
  BulkOperationsRequest as CrudBulkOperationsRequest,
  BulkOperationsResponse as CrudBulkOperationsResponse,
  AggregationRequest as CrudAggregationRequest,
  AggregationResponse as CrudAggregationResponse,
  PipelineValidationResult as CrudPipelineValidationResult
};