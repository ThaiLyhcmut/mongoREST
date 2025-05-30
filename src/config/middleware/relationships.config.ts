// Core field types for select queries
interface SelectField {
  type: 'field' | 'relationship' | 'aggregate';
  name?: string; // For type 'field'
  alias?: string; // For type 'relationship' and 'aggregate'
  relationName?: string; // For type 'relationship' and 'aggregate'
  explicitField?: string; // For type 'relationship' with explicit foreign key
  subFields?: SelectField[] | ['*']; // For type 'relationship'
  modifiers?: RelationshipModifiers; // For type 'relationship'
  aggregateType?: 'count' | 'sum' | 'avg' | 'min' | 'max'; // For type 'aggregate'
  aggregateField?: string; // For type 'aggregate'
}

// Relationship query modifiers
interface RelationshipModifiers {
  sort?: { [field: string]: 1 | -1 };
  limit?: number;
  skip?: number;
  joinType?: 'inner';
}

// Updated ParsedSelectQuery to match relationship-parser.js output
interface ParsedSelectQuery {
  fields: SelectField[];
  pipeline: AggregationStage[];
  hasRelationships: boolean;
}

// MongoDB aggregation pipeline stages
interface AggregationStage {
  $lookup?: {
    from: string;
    localField: string;
    foreignField: string;
    as: string;
    pipeline?: AggregationStage[];
  };
  $project?: { [field: string]: 0 | 1 };
  $addFields?: { [field: string]: any };
  $sort?: { [field: string]: 1 | -1 };
  $limit?: number;
  $skip?: number;
  $match?: { [field: string]: any };
  $size?: string;
  $sum?: string | { [key: string]: any };
  $avg?: string | { [key: string]: any };
  $min?: string | { [key: string]: any };
  $max?: string | { [key: string]: any };
  $arrayElemAt?: [string, number];
  $or?: Array<{ [field: string]: any }>;
  $and?: Array<{ [field: string]: any }>;
  $regex?: string;
  $options?: string;
}

// Filter query structure from relationship-filter.js
interface ParsedFilters {
  filters: { [field: string]: MongoFilterValue };
  relationshipFilters: { [relationPath: string]: { [field: string]: MongoFilterValue } };
  specialFilters: { [key: string]: any };
  hasRelationshipFilters: boolean;
}

// MongoDB filter value types
interface MongoFilterValue {
  $eq?: any;
  $ne?: any;
  $gt?: any;
  $gte?: any;
  $lt?: any;
  $lte?: any;
  $in?: any[];
  $nin?: any[];
  $regex?: string;
  $options?: string;
  $exists?: boolean;
  $size?: number;
  $or?: Array<{ [field: string]: any }>;
  $and?: Array<{ [field: string]: any }>;
  $not?: { [key: string]: any };
}

// Relationship query parameters
interface RelationshipQuery {
  select?: string; // Select fields parameter
  filters?: { [field: string]: any }; // Filter parameters
  sort?: string; // Sort field
  order?: 'asc' | 'desc' | '1' | '-1'; // Sort direction
  page?: number; // Page number for pagination
  limit?: number; // Items per page
  offset?: number; // Skip items
  search?: string; // Text search term
  searchFields?: string; // Comma-separated search fields
}

// Validation error structure
interface RelationshipValidationError {
  field: string;
  error: string;
  suggestion?: string;
  relationPath?: string; // For relationship-specific errors
}

// Relationship context with enhanced information
interface RelationshipContext {
  collection: string;
  query: RelationshipQuery;
  parsedSelect?: ParsedSelectQuery;
  parsedFilters?: ParsedFilters;
  validation: {
    isValid: boolean;
    errors: RelationshipValidationError[];
  };
  optimization: {
    cacheKey: string;
    estimatedCost: number;
    canOptimize: boolean;
    pipelineStages: number;
  };
}

// Relationship definition from schema
interface RelationshipDefinition {
  type: 'belongsTo' | 'hasMany' | 'manyToMany';
  collection: string;
  localField: string;
  foreignField: string;
  through?: string; // For manyToMany relationships
  throughLocalField?: string; // For manyToMany relationships
  throughForeignField?: string; // For manyToMany relationships
  defaultFilters?: { [field: string]: any };
  defaultSort?: { [field: string]: 1 | -1 };
  pagination?: {
    defaultLimit: number;
    maxLimit: number;
  };
}

// Pagination configuration
interface PaginationStages {
  skip?: number;
  limit: number;
  totalStages: AggregationStage[];
}

// Text search configuration
interface TextSearchStage {
  $match: {
    $text?: { $search: string };
    $or?: Array<{ [field: string]: { $regex: string; $options: string } }>;
  };
}

// Parser options and configuration
interface RelationshipParserOptions {
  maxDepth?: number;
  defaultLimit?: number;
  maxLimit?: number;
  enableTextSearch?: boolean;
  enableAggregates?: boolean;
  caseInsensitiveSearch?: boolean;
}

// Filter parser configuration
interface FilterParserOptions {
  enableRelationshipFilters?: boolean;
  enableTextSearch?: boolean;
  maxFilterDepth?: number;
  validOperators?: string[];
  strictFieldValidation?: boolean;
}

// Complete relationship processing result
interface RelationshipProcessingResult {
  success: boolean;
  data?: {
    parsedSelect: ParsedSelectQuery;
    parsedFilters: ParsedFilters;
    finalPipeline: AggregationStage[];
    paginationStages?: PaginationStages;
    estimatedCost: number;
  };
  errors?: RelationshipValidationError[];
  warnings?: string[];
  metadata?: {
    processingTime: number;
    cacheHit: boolean;
    optimizationsApplied: string[];
  };
}

export {
  SelectField,
  RelationshipModifiers,
  ParsedSelectQuery,
  AggregationStage,
  ParsedFilters,
  MongoFilterValue,
  RelationshipQuery,
  RelationshipValidationError,
  RelationshipContext,
  RelationshipDefinition,
  PaginationStages,
  TextSearchStage,
  RelationshipParserOptions,
  FilterParserOptions,
  RelationshipProcessingResult
};