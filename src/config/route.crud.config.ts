import { FastifySchema } from 'fastify';

// Collection information interfaces
export interface CollectionInfo {
  name: string;
  title: string;
  description: string;
  endpoints: CollectionEndpoints;
  permissions: CollectionPermissions;
  indexes: CollectionIndex[];
  properties: number;
  required: number;
  relationships: number;
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

export interface CollectionStats {
  documentCount: number;
  averageDocumentSize: number;
  totalSize: number;
  storageSize: number;
  indexes: number;
  indexSize: number;
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
  schema: {
    title: string;
    description: string;
    type: string;
    properties: { [key: string]: SchemaProperty };
    required: string[];
    additionalProperties: boolean;
    validationRules: ValidationRule[];
  };
  meta: {
    version: string;
    lastModified: string;
    propertyCount: number;
  };
}

export interface CollectionStatsResponse {
  success: boolean;
  collection: string;
  stats: CollectionStats;
  meta: {
    collectedAt: string;
    database: string;
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
                relationships: { type: 'number' }
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
          schema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              type: { type: 'string' },
              properties: { type: 'object' },
              required: { type: 'array', items: { type: 'string' } },
              additionalProperties: { type: 'boolean' },
              validationRules: { type: 'array' }
            }
          },
          meta: {
            type: 'object',
            properties: {
              version: { type: 'string' },
              lastModified: { type: 'string' },
              propertyCount: { type: 'number' }
            }
          }
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
              documentCount: { type: 'number' },
              averageDocumentSize: { type: 'number' },
              totalSize: { type: 'number' },
              storageSize: { type: 'number' },
              indexes: { type: 'number' },
              indexSize: { type: 'number' }
            }
          },
          meta: {
            type: 'object',
            properties: {
              collectedAt: { type: 'string' },
              database: { type: 'string' }
            }
          }
        }
      }
    }
  } as FastifySchema,

  relationships: {
    description: 'Get relationship information for a specific collection',
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
          relationships: {
            type: 'object',
            properties: {
              outgoing: { type: 'array' },
              incoming: { type: 'array' }
            }
          },
          meta: {
            type: 'object',
            properties: {
              totalRelationships: { type: 'number' },
              outgoingCount: { type: 'number' },
              incomingCount: { type: 'number' }
            }
          }
        }
      }
    }
  } as FastifySchema,

  indexes: {
    description: 'Get index information for a specific collection',
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
          indexes: { type: 'array' },
          meta: {
            type: 'object',
            properties: {
              totalIndexes: { type: 'number' },
              totalIndexSize: { type: 'number' },
              collectedAt: { type: 'string' }
            }
          }
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