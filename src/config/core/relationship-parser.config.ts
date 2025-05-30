// Main parsed select field interface
export interface ParsedSelectField {
  type: 'field' | 'relationship' | 'aggregate';
  name?: string;
  alias?: string;
  relationName?: string;
  explicitField?: string;
  subFields?: ParsedSelectField[] | string[];
  modifiers?: RelationshipModifiers;
  aggregateType?: AggregateType;
  aggregateField?: string;
}

// Relationship modifiers for query enhancement
export interface RelationshipModifiers {
  sort?: {
    [field: string]: 1 | -1;
  };
  limit?: number;
  skip?: number;
  joinType?: 'inner' | 'left';
  filters?: {
    [field: string]: any;
  };
}

// Aggregate operation types
export type AggregateType = 'count' | 'sum' | 'avg' | 'min' | 'max';

// Relationship definition interface
export interface RelationshipDefinition {
  type: 'belongsTo' | 'hasMany' | 'manyToMany';
  collection: string;
  localField: string;
  foreignField: string;
  
  // Many-to-many specific fields
  through?: string;
  throughLocalField?: string;
  throughForeignField?: string;
  
  // Query defaults
  defaultFilters?: {
    [field: string]: any;
  };
  defaultSort?: {
    [field: string]: 1 | -1;
  };
  
  // Pagination settings
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
  
  // Validation rules
  required?: boolean;
  cascade?: {
    delete?: boolean;
    update?: boolean;
  };
}

// Collection schema interface
export interface CollectionSchema {
  $schema?: string;
  $id?: string;
  title: string;
  description?: string;
  type: 'object';
  collection?: string;
  
  // Schema properties
  properties?: {
    [fieldName: string]: PropertySchema;
  };
  required?: string[];
  additionalProperties?: boolean;
  
  // Relationships
  relationships?: {
    [relationName: string]: RelationshipDefinition;
  };
  
  // MongoDB REST configuration
  mongorest?: MongoRestConfig;
  
  // Indexes
  indexes?: IndexDefinition[];
}

// Property schema for individual fields
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
}

// MongoDB REST configuration
export interface MongoRestConfig {
  permissions?: {
    read?: string[];
    create?: string[];
    update?: string[];
    delete?: string[];
  };
  
  rateLimits?: {
    [operation: string]: RateLimitConfig;
  };
  
  pagination?: {
    defaultLimit: number;
    maxLimit: number;
    allowUnlimited: boolean;
  };
  
  search?: {
    enabled: boolean;
    fields: string[];
    fuzzy?: boolean;
    minLength?: number;
  };
  
  cache?: {
    enabled: boolean;
    ttl: number;
    invalidateOn: string[];
  };
}

// Rate limiting configuration
export interface RateLimitConfig {
  requests: number;
  window: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: string;
}

// Index definition
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
}

// Parser result interfaces
export interface ParseSelectQueryResult {
  fields: ParsedSelectField[];
  pipeline: any[];
  hasRelationships: boolean;
}

export interface RelationshipQueryValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

// Pipeline building options
export interface PipelineBuildOptions {
  collection: string;
  selectFields: ParsedSelectField[];
  includeProjection?: boolean;
  maxDepth?: number;
  enableOptimization?: boolean;
}

// Lookup stage configuration
export interface LookupStageConfig {
  from: string;
  localField: string;
  foreignField: string;
  as: string;
  pipeline?: any[];
  let?: {
    [variable: string]: any;
  };
}

// Aggregate stage configuration
export interface AggregateStageConfig {
  relationship: RelationshipDefinition;
  field: ParsedSelectField;
  collection: string;
  tempAlias: string;
}

// Sub-pipeline building options
export interface SubPipelineOptions {
  subFields: ParsedSelectField[] | string[];
  collection: string;
  modifiers?: RelationshipModifiers;
  maxDepth?: number;
  currentDepth?: number;
}

// Many-to-many relationship configuration
export interface ManyToManyConfig {
  relationship: RelationshipDefinition;
  field: ParsedSelectField;
  junctionAlias: string;
  targetAlias: string;
}

// Validation context for relationship queries
export interface ValidationContext {
  collection: string;
  schema: CollectionSchema;
  maxDepth: number;
  currentDepth: number;
  visitedCollections: Set<string>;
}

// Field validation result
export interface FieldValidationResult {
  field: ParsedSelectField;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Modifier validation options
export interface ModifierValidationOptions {
  modifiers: RelationshipModifiers;
  relationship: RelationshipDefinition;
  targetSchema: CollectionSchema;
  context: ValidationContext;
}

// Parser configuration options
export interface RelationshipParserOptions {
  maxDepth?: number;
  enableValidation?: boolean;
  enableOptimization?: boolean;
  defaultLimit?: number;
  maxLimit?: number;
  allowWildcard?: boolean;
  enableAggregation?: boolean;
  cacheResults?: boolean;
}

// Parse field context
export interface ParseFieldContext {
  fieldStr: string;
  parentCollection?: string;
  depth: number;
  maxDepth: number;
}

// Modifier parsing result
export interface ModifierParsingResult {
  sort?: { [field: string]: 1 | -1 };
  limit?: number;
  skip?: number;
  joinType?: 'inner' | 'left';
  filters?: { [field: string]: any };
  [key: string]: any;
}

// Parser state for complex parsing
export interface ParserState {
  currentField: string;
  depth: number;
  inParens: boolean;
  position: number;
  errors: string[];
}

// Optimization hints for relationship queries
export interface OptimizationHints {
  useIndexes: string[];
  batchSize?: number;
  allowDiskUse?: boolean;
  maxTimeMS?: number;
  hint?: string | { [field: string]: 1 | -1 };
}

// Query performance metrics
export interface QueryMetrics {
  parseTime: number;
  validationTime: number;
  pipelineBuildTime: number;
  estimatedCost: number;
  optimizationApplied: boolean;
}

// Relationship query cache entry
export interface RelationshipCacheEntry {
  query: string;
  collection: string;
  result: ParseSelectQueryResult;
  timestamp: number;
  accessCount: number;
  ttl: number;
}

// Error types for relationship parsing
export type RelationshipParseError = 
  | 'INVALID_SYNTAX'
  | 'UNKNOWN_FIELD'
  | 'UNKNOWN_RELATIONSHIP'
  | 'INVALID_MODIFIER'
  | 'DEPTH_EXCEEDED'
  | 'CIRCULAR_REFERENCE'
  | 'VALIDATION_FAILED'
  | 'SCHEMA_NOT_FOUND'
  | 'PERMISSION_DENIED';

// Detailed error information
export interface RelationshipError {
  type: RelationshipParseError;
  message: string;
  field?: string;
  collection?: string;
  suggestion?: string;
  context?: {
    position?: number;
    depth?: number;
    path?: string[];
  };
}

// Parser statistics
export interface ParserStatistics {
  totalQueries: number;
  cacheHits: number;
  cacheMisses: number;
  averageParseTime: number;
  averageValidationTime: number;
  errorCount: number;
  mostUsedRelationships: { [relationship: string]: number };
}

// Default configurations
export const DEFAULT_RELATIONSHIP_PARSER_OPTIONS: Required<RelationshipParserOptions> = {
  maxDepth: 3,
  enableValidation: true,
  enableOptimization: true,
  defaultLimit: 20,
  maxLimit: 100,
  allowWildcard: true,
  enableAggregation: true,
  cacheResults: false
};

export const DEFAULT_RELATIONSHIP_MODIFIERS: Required<RelationshipModifiers> = {
  sort: {},
  limit: 20,
  skip: 0,
  joinType: 'left',
  filters: {}
};

export const DEFAULT_VALIDATION_CONTEXT: Omit<ValidationContext, 'collection' | 'schema'> = {
  maxDepth: 3,
  currentDepth: 0,
  visitedCollections: new Set()
};

// Export utility types
export type SchemaMap = Map<string, CollectionSchema>;
export type RelationshipMap = Map<string, RelationshipDefinition>;
export type FieldPath = string[];
export type SortDirection = 1 | -1;
export type PipelineStage = { [operator: string]: any };

// Re-export for backwards compatibility
export {
  type ParsedSelectField as SelectField,
  type RelationshipDefinition as Relationship,
  type CollectionSchema as Schema
};