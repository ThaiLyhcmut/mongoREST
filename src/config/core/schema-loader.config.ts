// Schema Loader Options
export interface SchemaLoaderOptions {
  schemasPath?: string;
  collectionsPath?: string;
  functionsPath?: string;
  validateOnLoad?: boolean;
  enableHotReload?: boolean;
  watchFiles?: boolean;
}

// Schema Collections
export type SchemaCollection = Map<string, CollectionSchema>;
export type FunctionCollection = Map<string, FunctionDefinition>;

// Loading Results
export interface LoadedSchemas {
  collections: number;
  functions: number;
}

// Validation Results
export interface SchemaValidationResult {
  valid: boolean;
  errors?: any[];
}

// Schema Information for API responses
export interface SchemaInfo {
  name: string;
  title: string;
  description: string;
  collection: string;
}

export interface FunctionInfo {
  name: string;
  description: string;
  method: string;
  endpoint?: string;
  category?: string;
}

// Collection Schema Definition
export interface CollectionSchema {
  $schema?: string;
  $id?: string;
  title: string;
  description?: string;
  type: 'object';
  collection?: string;
  properties: {
    [fieldName: string]: PropertySchema;
  };
  required?: string[];
  additionalProperties?: boolean;
  
  // MongoDB REST specific configuration
  mongorest?: MongoRestConfig;
  
  // MongoDB indexes
  indexes?: IndexDefinition[];
  
  // Relationships with other collections
  relationships?: {
    [relationName: string]: RelationshipDefinition;
  };
  
  // JSON Schema validation
  allOf?: any[];
  anyOf?: any[];
  oneOf?: any[];
  not?: any;
  if?: any;
  then?: any;
  else?: any;
}

// Property Schema for individual fields
export interface PropertySchema {
  type: string | string[];
  description?: string;
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  multipleOf?: number;
  enum?: any[];
  const?: any;
  default?: any;
  examples?: any[];
  
  // Array specific
  items?: PropertySchema | PropertySchema[];
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  
  // Object specific
  properties?: {
    [key: string]: PropertySchema;
  };
  required?: string[];
  additionalProperties?: boolean | PropertySchema;
  
  // MongoDB specific
  objectId?: boolean;
  bsonType?: string;
  
  // Custom validation
  customValidator?: string;
  errorMessage?: string;
}

// MongoDB REST Configuration
export interface MongoRestConfig {
  // Access permissions per operation
  permissions?: {
    read?: string[];
    create?: string[];
    update?: string[];
    delete?: string[];
  };
  
  // Rate limiting per operation
  rateLimits?: {
    [operation: string]: RateLimitConfig;
  };
  
  // Default pagination settings
  pagination?: {
    defaultLimit: number;
    maxLimit: number;
    allowUnlimited: boolean;
  };
  
  // Search configuration
  search?: {
    enabled: boolean;
    fields: string[];
    fuzzy?: boolean;
    minLength?: number;
  };
  
  // Caching configuration
  cache?: {
    enabled: boolean;
    ttl: number;
    invalidateOn: string[];
  };
  
  // Audit logging
  audit?: {
    enabled: boolean;
    operations: string[];
    includeData: boolean;
  };
  
  // Custom validation rules
  validation?: {
    onCreate?: string[];
    onUpdate?: string[];
    onDelete?: string[];
  };
  
  // Transform hooks
  transforms?: {
    input?: string[];
    output?: string[];
  };
}

// Rate Limiting Configuration
export interface RateLimitConfig {
  requests: number;
  window: number; // in milliseconds
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: string;
}

// Index Definition
export interface IndexDefinition {
  name?: string;
  fields: {
    [fieldName: string]: 1 | -1 | 'text' | '2dsphere' | 'hashed';
  };
  unique?: boolean;
  sparse?: boolean;
  background?: boolean;
  partialFilterExpression?: any;
  expireAfterSeconds?: number;
  collation?: {
    locale: string;
    caseLevel?: boolean;
    caseFirst?: string;
    strength?: number;
    numericOrdering?: boolean;
    alternate?: string;
    maxVariable?: string;
    backwards?: boolean;
  };
}

// Relationship Definition
export interface RelationshipDefinition {
  type: 'belongsTo' | 'hasMany' | 'manyToMany';
  collection: string;
  localField: string;
  foreignField: string;
  
  // Many-to-many specific
  through?: string;
  throughLocalField?: string;
  throughForeignField?: string;
  
  // Query options
  defaultFilters?: {
    [field: string]: any;
  };
  defaultSort?: {
    [field: string]: 1 | -1;
  };
  
  // Pagination for hasMany relationships
  pagination?: {
    defaultLimit: number;
    maxLimit: number;
  };
  
  // Access control
  permissions?: {
    read?: string[];
    create?: string[];
    update?: string[];
    delete?: string[];
  };
  
  // Performance settings
  cache?: {
    enabled: boolean;
    ttl: number;
  };
  
  // Validation
  required?: boolean;
  cascade?: {
    delete?: boolean;
    update?: boolean;
  };
}

// Function Definition
export interface FunctionDefinition {
  name: string;
  description: string;
  category?: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpoint?: string;
  
  // Input/Output schemas
  input?: PropertySchema;
  output?: PropertySchema;
  
  // Function steps
  steps: FunctionStep[];
  
  // Configuration
  config?: {
    timeout?: number;
    retries?: number;
    caching?: {
      enabled: boolean;
      ttl: number;
      key?: string;
    };
    rateLimit?: RateLimitConfig;
    permissions?: string[];
  };
  
  // Error handling
  errorHandling?: {
    continueOnError?: boolean;
    defaultErrorResponse?: any;
    customErrorMessages?: {
      [errorCode: string]: string;
    };
  };
  
  // Metadata
  version?: string;
  author?: string;
  tags?: string[];
  deprecated?: boolean;
  examples?: FunctionExample[];
}

// Function Step Definition
export interface FunctionStep {
  id: string;
  type: FunctionStepType;
  description?: string;
  
  // MongoDB operations
  collection?: string;
  operation?: string;
  query?: any;
  update?: any;
  options?: any;
  
  // HTTP operations
  url?: string;
  headers?: {
    [key: string]: string;
  };
  body?: any;
  
  // Transform operations
  transform?: string | TransformFunction;
  
  // Conditional operations
  condition?: string | ConditionFunction;
  onTrue?: string; // Next step ID
  onFalse?: string; // Next step ID
  
  // Error handling
  onError?: string; // Error step ID
  continueOnError?: boolean;
  
  // Variable assignment
  assignTo?: string;
  
  // Dependencies
  dependsOn?: string[];
  
  // Timing
  timeout?: number;
  delay?: number;
}

// Function Step Types
export type FunctionStepType = 
  // MongoDB operations
  | 'find'
  | 'findOne'
  | 'insertOne'
  | 'insertMany'
  | 'updateOne'
  | 'updateMany'
  | 'deleteOne'
  | 'deleteMany'
  | 'aggregate'
  | 'countDocuments'
  | 'distinct'
  // Data operations
  | 'transform'
  | 'validate'
  | 'filter'
  | 'sort'
  | 'group'
  | 'merge'
  // External operations
  | 'http'
  | 'email'
  | 'notification'
  // Control flow
  | 'condition'
  | 'loop'
  | 'parallel'
  | 'sequential'
  // Utility
  | 'delay'
  | 'log'
  | 'cache'
  | 'error';

// Transform and Condition Functions
export interface TransformFunction {
  type: 'javascript' | 'jsonata' | 'template';
  code: string;
  context?: {
    [key: string]: any;
  };
}

export interface ConditionFunction {
  type: 'javascript' | 'jsonata' | 'simple';
  expression: string;
  context?: {
    [key: string]: any;
  };
}

// Function Example
export interface FunctionExample {
  name: string;
  description?: string;
  input: any;
  expectedOutput: any;
  context?: {
    [key: string]: any;
  };
}

// Validation Error Details
export interface ValidationError {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  params: any;
  message: string;
  data?: any;
}

// Schema Statistics
export interface SchemaStatistics {
  totalSchemas: number;
  totalFunctions: number;
  schemasWithRelationships: number;
  schemasWithIndexes: number;
  functionsWithCaching: number;
  functionsWithRateLimit: number;
  averagePropertiesPerSchema: number;
  averageStepsPerFunction: number;
}

// Schema Loader Events
export interface SchemaLoaderEvents {
  'schema-loaded': { name: string; type: 'collection' | 'function' };
  'schema-error': { name: string; error: Error };
  'schema-validated': { name: string; valid: boolean };
  'schemas-reloaded': { collections: number; functions: number };
  'file-changed': { path: string; type: 'added' | 'changed' | 'removed' };
}

// Hot Reload Configuration
export interface HotReloadConfig {
  enabled: boolean;
  watchPaths: string[];
  debounceMs: number;
  restartOnError: boolean;
  excludePatterns: string[];
}

// Schema Loader State
export interface SchemaLoaderState {
  initialized: boolean;
  loading: boolean;
  lastLoadTime: Date;
  loadDuration: number;
  errors: ValidationError[];
  warnings: string[];
  statistics: SchemaStatistics;
}

// Export all types and interfaces
export {
  // Re-export for backwards compatibility
  type SchemaCollection as Schemas,
  type FunctionCollection as Functions
};

// Default configurations
export const DEFAULT_SCHEMA_LOADER_OPTIONS: Required<SchemaLoaderOptions> = {
  schemasPath: './schemas',
  collectionsPath: './schemas/collections',
  functionsPath: './schemas/functions',
  validateOnLoad: true,
  enableHotReload: false,
  watchFiles: false
};

export const DEFAULT_MONGO_REST_CONFIG: Required<MongoRestConfig> = {
  permissions: {
    read: ['user'],
    create: ['user'],
    update: ['user'],
    delete: ['admin']
  },
  rateLimits: {},
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
    allowUnlimited: false
  },
  search: {
    enabled: false,
    fields: [],
    fuzzy: false,
    minLength: 3
  },
  cache: {
    enabled: false,
    ttl: 300,
    invalidateOn: ['create', 'update', 'delete']
  },
  audit: {
    enabled: false,
    operations: ['create', 'update', 'delete'],
    includeData: false
  },
  validation: {
    onCreate: [],
    onUpdate: [],
    onDelete: []
  },
  transforms: {
    input: [],
    output: []
  }
};

export const DEFAULT_RATE_LIMIT_CONFIG: Required<RateLimitConfig> = {
  requests: 100,
  window: 60000, // 1 minute
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  keyGenerator: 'ip'
};

export const DEFAULT_HOT_RELOAD_CONFIG: Required<HotReloadConfig> = {
  enabled: false,
  watchPaths: ['./schemas'],
  debounceMs: 1000,
  restartOnError: true,
  excludePatterns: ['*.tmp', '*.bak', '*~']
};