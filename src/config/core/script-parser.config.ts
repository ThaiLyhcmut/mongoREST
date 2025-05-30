// Script Parser Configuration and Types

// Request body containing MongoDB scripts
export interface ScriptRequestBody {
  script?: string;
  mongoScript?: string;
  query?: string;
  [key: string]: any;
}

// Parsed script result
export interface ParsedScript {
  collection: string;
  operation: string;
  params: ScriptParams;
  meta?: ScriptMeta;
}

// Script parameters from parsed MongoDB operations
export interface ScriptParams {
  // Common parameters
  query?: any;
  filter?: any;
  projection?: any;
  sort?: { [field: string]: 1 | -1 };
  limit?: number;
  skip?: number;
  
  // Insert operations
  document?: any;
  documents?: any[];
  
  // Update operations
  update?: any;
  replacement?: any;
  
  // Aggregation
  pipeline?: any[];
  
  // Bulk operations
  operations?: any[];
  
  // Options
  options?: { [key: string]: any };
  
  // Generic fallback
  [key: string]: any;
}

// Script metadata with enhanced information
export interface ScriptMeta {
  originalScript?: string;
  complexity?: number;
  collections?: string[];
  operations?: string[];
  estimatedExecutionTime?: number;
  hasAggregation?: boolean;
  hasIndexHints?: boolean;
  isReadOnly?: boolean;
  requiresTransaction?: boolean;
  optimizationLevel?: 'none' | 'basic' | 'aggressive';
  parsedAt?: string;
  dangerousOperators?: string[];
  nestedDepth?: number;
  aggregationStages?: number;
}

// Chained operations (sort, limit, skip)
export interface ChainedOperations {
  sort?: { [field: string]: 1 | -1 };
  limit?: number;
  skip?: number;
  projection?: any;
  hint?: string | { [field: string]: 1 | -1 };
  maxTimeMS?: number;
  readPreference?: string;
  [key: string]: any;
}

// Script validation result (simplified from existing)
export interface ScriptValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
  isValid?: boolean; // For compatibility with detailed version
  errors?: ScriptValidationError[];
  suggestions?: string[];
}

// Script parsing options (enhanced)
export interface ScriptParserOptions {
  maxComplexity?: number;
  enableValidation?: boolean;
  strictMode?: boolean;
  allowedOperations?: string[];
  forbiddenOperations?: string[];
  maxCollections?: number;
  timeoutMs?: number;
  enableOptimization?: boolean;
  allowDangerousOperators?: boolean;
  maxNestedDepth?: number;
  enableCaching?: boolean;
}

// Script metadata (detailed version)
export interface ScriptMetadata {
  originalScript?: string;
  complexity?: number;
  collections?: string[];
  operations?: string[];
  estimatedExecutionTime?: number;
  hasAggregation?: boolean;
  hasIndexHints?: boolean;
  isReadOnly?: boolean;
  requiresTransaction?: boolean;
  optimizationLevel?: 'none' | 'basic' | 'aggressive';
}

// Parser result wrapper
export interface ParserResult {
  success: boolean;
  parsed?: ParsedScript;
  error?: string;
  warnings?: string[];
  parseTime?: number;
}

// Script analysis result
export interface ScriptAnalysis {
  readOperations: number;
  writeOperations: number;
  aggregationStages: number;
  indexHints: number;
  crossCollectionRefs: boolean;
  usesTransactions: boolean;
  estimatedComplexity: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

// Script validation error
export interface ScriptValidationError {
  type: ScriptErrorType;
  message: string;
  line?: number;
  column?: number;
  operation?: string;
  collection?: string;
  field?: string;
  suggestion?: string;
}

// Script validation warning
export interface ScriptValidationWarning {
  type: ScriptWarningType;
  message: string;
  suggestion?: string;
  performance?: boolean;
  security?: boolean;
}

// Error types for script validation
export type ScriptErrorType = 
  | 'SYNTAX_ERROR'
  | 'UNKNOWN_OPERATION'
  | 'UNKNOWN_COLLECTION'
  | 'INVALID_FIELD'
  | 'PERMISSION_DENIED'
  | 'COMPLEXITY_EXCEEDED'
  | 'TIMEOUT_EXCEEDED'
  | 'FORBIDDEN_OPERATION'
  | 'INVALID_QUERY_SYNTAX'
  | 'MISSING_REQUIRED_FIELD'
  | 'TYPE_MISMATCH'
  | 'CIRCULAR_REFERENCE'
  | 'DANGEROUS_OPERATOR'
  | 'INVALID_PARAMETER_FORMAT'
  | 'UNSUPPORTED_OPERATION';

// Warning types for script validation
export type ScriptWarningType = 
  | 'PERFORMANCE_CONCERN'
  | 'DEPRECATED_SYNTAX'
  | 'MISSING_INDEX'
  | 'LARGE_RESULT_SET'
  | 'INEFFICIENT_QUERY'
  | 'SECURITY_CONCERN'
  | 'COMPATIBILITY_ISSUE'
  | 'UNQUOTED_FIELD_NAMES'
  | 'TRAILING_COMMA'
  | 'REGEX_WITHOUT_INDEX';

// Script operation types
export type ScriptOperation = 
  // Read operations
  | 'find'
  | 'findOne'
  | 'findOneAndUpdate'
  | 'findOneAndDelete'
  | 'findOneAndReplace'
  | 'countDocuments'
  | 'estimatedDocumentCount'
  | 'distinct'
  | 'aggregate'
  // Write operations
  | 'insertOne'
  | 'insertMany'
  | 'updateOne'
  | 'updateMany'
  | 'replaceOne'
  | 'deleteOne'
  | 'deleteMany'
  | 'bulkWrite'
  // Index operations
  | 'createIndex'
  | 'createIndexes'
  | 'dropIndex'
  | 'dropIndexes'
  | 'listIndexes'
  | 'reIndex'
  // Collection operations
  | 'createCollection'
  | 'dropCollection'
  | 'renameCollection'
  | 'listCollections'
  // Database operations
  | 'runCommand'
  | 'eval'
  | 'mapReduce';

// MongoDB operators categorized by type
export interface MongoOperators {
  query: string[];
  update: string[];
  aggregation: string[];
  dangerous: string[];
}

// Parameter formatting configuration
export interface ParameterFormattingConfig {
  operation: string;
  expectedParams: string[];
  parameterMap: { [position: number]: string };
  arrayFormat?: boolean;
  objectFormat?: boolean;
}

// Script complexity calculation factors
export interface ComplexityFactors {
  baseComplexity: number;
  operationMultiplier: number;
  aggregationStages: number;
  indexUsage: number;
  crossCollectionJoins: number;
  documentSize: number;
  resultSetSize: number;
  dangerousOperators: number;
  nestedDepth: number;
}

// Script transformation options
export interface ScriptTransformOptions {
  targetDialect?: 'mongodb' | 'mongoose' | 'native';
  enableOptimization?: boolean;
  addIndexHints?: boolean;
  addComments?: boolean;
  formatOutput?: boolean;
  minify?: boolean;
}

// Script execution context
export interface ScriptExecutionContext {
  user: {
    id: string;
    role: string;
    permissions: string[];
  };
  request: {
    ip: string;
    userAgent: string;
    timestamp: Date;
  };
  limits: {
    maxComplexity: number;
    maxExecutionTime: number;
    maxResultSize: number;
  };
  environment: 'development' | 'staging' | 'production';
}

// Script optimization result
export interface ScriptOptimizationResult {
  originalScript: string;
  optimizedScript: string;
  optimizations: OptimizationApplied[];
  performanceGain: number;
  complexityReduction: number;
}

// Applied optimization details
export interface OptimizationApplied {
  type: OptimizationType;
  description: string;
  impact: 'low' | 'medium' | 'high';
  savings: {
    complexity?: number;
    executionTime?: number;
    memoryUsage?: number;
  };
}

// Optimization types
export type OptimizationType = 
  | 'INDEX_HINT_ADDED'
  | 'PROJECTION_OPTIMIZED'
  | 'PIPELINE_REORDERED'
  | 'REDUNDANT_STAGE_REMOVED'
  | 'SORT_LIMIT_COMBINED'
  | 'MATCH_MOVED_EARLY'
  | 'LOOKUP_OPTIMIZED'
  | 'GROUP_OPTIMIZED'
  | 'FIELD_SELECTION_OPTIMIZED'
  | 'OBJECTID_CONVERSION'
  | 'QUERY_SIMPLIFICATION';

// Script parsing statistics
export interface ScriptParsingStatistics {
  totalScriptsParsed: number;
  successfulParses: number;
  failedParses: number;
  averageParseTime: number;
  averageComplexity: number;
  mostUsedOperations: { [operation: string]: number };
  errorDistribution: { [errorType: string]: number };
}

// Script cache entry
export interface ScriptCacheEntry {
  script: string;
  parsed: ParsedScript;
  hash: string;
  timestamp: number;
  accessCount: number;
  ttl: number;
}

// Parser state for complex parsing
export interface ParserState {
  input: string;
  position: number;
  line: number;
  column: number;
  depth: number;
  errors: ScriptValidationError[];
  warnings: ScriptValidationWarning[];
  context: string[];
}

// Token types for script lexer
export type TokenType = 
  | 'IDENTIFIER'
  | 'STRING'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'NULL'
  | 'UNDEFINED'
  | 'OPERATOR'
  | 'KEYWORD'
  | 'PUNCTUATION'
  | 'WHITESPACE'
  | 'COMMENT'
  | 'EOF';

// Lexer token
export interface Token {
  type: TokenType;
  value: string;
  position: number;
  line: number;
  column: number;
}

// AST node for parsed scripts
export interface ASTNode {
  type: string;
  value?: any;
  children?: ASTNode[];
  position?: {
    start: number;
    end: number;
    line: number;
    column: number;
  };
  metadata?: {
    [key: string]: any;
  };
}

// Script template for common operations
export interface ScriptTemplate {
  name: string;
  description: string;
  category: string;
  template: string;
  parameters: TemplateParameter[];
  examples: TemplateExample[];
  tags: string[];
}

// Template parameter definition
export interface TemplateParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: any;
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    enum?: any[];
  };
}

// Template usage example
export interface TemplateExample {
  name: string;
  description: string;
  parameters: { [key: string]: any };
  expectedResult: any;
}

// Script security analysis
export interface SecurityAnalysis {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  vulnerabilities: SecurityVulnerability[];
  recommendations: string[];
  allowedOperations: string[];
  blockedOperations: string[];
}

// Security vulnerability
export interface SecurityVulnerability {
  type: SecurityVulnerabilityType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  recommendation: string;
  cwe?: string; // Common Weakness Enumeration ID
}

// Security vulnerability types
export type SecurityVulnerabilityType = 
  | 'INJECTION_RISK'
  | 'PRIVILEGE_ESCALATION'
  | 'DATA_EXPOSURE'
  | 'UNAUTHORIZED_ACCESS'
  | 'RESOURCE_EXHAUSTION'
  | 'COMMAND_INJECTION'
  | 'PATH_TRAVERSAL'
  | 'EVAL_USAGE'
  | 'EXTERNAL_REFERENCE';

// Default configurations
export const DEFAULT_SCRIPT_PARSER_OPTIONS: Required<ScriptParserOptions> = {
  maxComplexity: 100,
  enableValidation: true,
  strictMode: false,
  allowedOperations: ['find', 'findOne', 'countDocuments', 'distinct', 'aggregate'],
  forbiddenOperations: ['eval', 'runCommand'],
  maxCollections: 5,
  timeoutMs: 30000,
  enableOptimization: true,
  allowDangerousOperators: false,
  maxNestedDepth: 10,
  enableCaching: false
};

export const DEFAULT_COMPLEXITY_FACTORS: Required<ComplexityFactors> = {
  baseComplexity: 1,
  operationMultiplier: 1,
  aggregationStages: 2,
  indexUsage: 0.5,
  crossCollectionJoins: 3,
  documentSize: 0.1,
  resultSetSize: 0.01,
  dangerousOperators: 5,
  nestedDepth: 0.5
};

export const DEFAULT_SCRIPT_TRANSFORM_OPTIONS: Required<ScriptTransformOptions> = {
  targetDialect: 'mongodb',
  enableOptimization: true,
  addIndexHints: false,
  addComments: false,
  formatOutput: true,
  minify: false
};

// MongoDB operators categorized
export const MONGO_OPERATORS: MongoOperators = {
  query: [
    '$and', '$or', '$not', '$nor',
    '$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin',
    '$exists', '$type', '$regex', '$expr', '$where',
    '$elemMatch', '$size', '$all'
  ],
  update: [
    '$set', '$unset', '$inc', '$push', '$pull', '$addToSet',
    '$pop', '$pullAll', '$rename', '$mul', '$min', '$max'
  ],
  aggregation: [
    '$match', '$group', '$project', '$sort', '$limit', '$skip',
    '$lookup', '$unwind', '$addFields', '$facet', '$count',
    '$bucket', '$bucketAuto', '$sample', '$indexStats'
  ],
  dangerous: ['$where', '$eval', '$function']
};

// Operation complexity weights
export const OPERATION_COMPLEXITY_WEIGHTS: { [operation: string]: number } = {
  // Read operations
  find: 1,
  findOne: 1,
  countDocuments: 2,
  distinct: 3,
  aggregate: 5,
  
  // Write operations
  insertOne: 2,
  insertMany: 3,
  updateOne: 3,
  updateMany: 4,
  replaceOne: 3,
  deleteOne: 2,
  deleteMany: 4,
  bulkWrite: 5,
  
  // Index operations
  createIndex: 8,
  dropIndex: 6,
  listIndexes: 2,
  
  // Collection operations
  createCollection: 5,
  dropCollection: 8,
  renameCollection: 7,
  
  // Dangerous operations
  eval: 10,
  runCommand: 8,
  mapReduce: 9
};

// Parameter formatting configurations
export const PARAMETER_FORMATS: { [operation: string]: ParameterFormattingConfig } = {
  find: {
    operation: 'find',
    expectedParams: ['query', 'projection'],
    parameterMap: { 0: 'query', 1: 'projection' },
    arrayFormat: true
  },
  insertOne: {
    operation: 'insertOne',
    expectedParams: ['document'],
    parameterMap: { 0: 'document' },
    objectFormat: true
  },
  insertMany: {
    operation: 'insertMany',
    expectedParams: ['documents'],
    parameterMap: { 0: 'documents' },
    arrayFormat: true
  },
  updateOne: {
    operation: 'updateOne',
    expectedParams: ['filter', 'update'],
    parameterMap: { 0: 'filter', 1: 'update' },
    arrayFormat: true
  },
  updateMany: {
    operation: 'updateMany',
    expectedParams: ['filter', 'update'],
    parameterMap: { 0: 'filter', 1: 'update' },
    arrayFormat: true
  },
  deleteOne: {
    operation: 'deleteOne',
    expectedParams: ['filter'],
    parameterMap: { 0: 'filter' },
    objectFormat: true
  },
  deleteMany: {
    operation: 'deleteMany',
    expectedParams: ['filter'],
    parameterMap: { 0: 'filter' },
    objectFormat: true
  },
  aggregate: {
    operation: 'aggregate',
    expectedParams: ['pipeline'],
    parameterMap: { 0: 'pipeline' },
    arrayFormat: true
  },
  replaceOne: {
    operation: 'replaceOne',
    expectedParams: ['filter', 'replacement'],
    parameterMap: { 0: 'filter', 1: 'replacement' },
    arrayFormat: true
  },
  countDocuments: {
    operation: 'countDocuments',
    expectedParams: ['query'],
    parameterMap: { 0: 'query' },
    objectFormat: true
  },
  distinct: {
    operation: 'distinct',
    expectedParams: ['field', 'query'],
    parameterMap: { 0: 'field', 1: 'query' },
    arrayFormat: true
  }
};

// Export utility types
export type ScriptMap = Map<string, ParsedScript>;
export type TemplateMap = Map<string, ScriptTemplate>;
export type CacheMap = Map<string, ScriptCacheEntry>;

// Re-export for backwards compatibility
export {
  type ParsedScript as Script,
  type ScriptRequestBody as RequestBody,
  type ParserResult as Result,
  type ScriptParams as Params,
  type ScriptMeta as Meta
};