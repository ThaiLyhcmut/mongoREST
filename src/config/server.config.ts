// Configuration interfaces for MongoREST server
// These interfaces define the structure of configuration files

// JWT Configuration Interface
export interface JWTConfig {
  secret: string;
  algorithm: string;
  expiresIn: string;
  issuer: string;
  audience: string;
}

// Role Configuration Interface
export interface RoleConfig {
  description: string;
  permissions: string[];
  collections: string[];
  functions: string[];
  rateLimits: {
    requests: number;
    window: string;
  };
}

// Collection Permissions Interface
export interface CollectionPermissions {
  [operation: string]: string[]; // operation -> array of roles
}

// Function Permissions Interface
export interface FunctionPermissions {
  [functionName: string]: string[]; // function name -> array of roles
}

// Auth Configuration Interface
export interface AuthConfig {
  jwt: JWTConfig;
  roles: {
    [roleName: string]: RoleConfig;
  };
  collectionPermissions: {
    [collectionName: string]: CollectionPermissions;
  };
  functionPermissions: FunctionPermissions;
}

// HTTP Method Operations Mapping Interface
export interface MethodOperationsMapping {
  allowedOperations: string[];
  description: string;
}

// Operation Inference Interface
export interface OperationInference {
  [route: string]: string; // route pattern -> operation name
}

// Validation Configuration Interface
export interface ValidationConfig {
  enabled: boolean;
  rejectOnViolation: boolean;
  logViolations: boolean;
}

// Special Cases Configuration Interface
export interface SpecialCases {
  [operation: string]: {
    [method: string]: string;
  };
}

// Method Configuration Interface
export interface MethodConfig {
  strict: boolean;
  mappings: {
    [httpMethod: string]: MethodOperationsMapping;
  };
  specialCases: SpecialCases;
  validation: ValidationConfig;
  operationInference: OperationInference;
}

// Server Base Configuration Interface
export interface ServerBaseConfig {
  host: string;
  port: string;
  bodyLimit: number;
  keepAliveTimeout: number;
  pluginTimeout: number;
}

// Logging Configuration Interface
export interface LoggingConfig {
  level: string;
  prettyPrint: string;
  serializers: {
    req: string;
    res: string;
  };
}

// OpenAPI Info Interface
export interface OpenAPIInfo {
  title: string;
  description: string;
  version: string;
}

// OpenAPI Server Interface
export interface OpenAPIServer {
  url: string;
  description: string;
}

// Security Scheme Interface
export interface SecurityScheme {
  type: string;
  scheme: string;
  bearerFormat?: string;
}

// OpenAPI Components Interface
export interface OpenAPIComponents {
  securitySchemes: {
    [schemeName: string]: SecurityScheme;
  };
}

// OpenAPI Security Interface
export interface OpenAPISecurity {
  [schemeName: string]: string[];
}

// OpenAPI Configuration Interface
export interface OpenAPIConfig {
  openapi: string;
  info: OpenAPIInfo;
  servers: OpenAPIServer[];
  components: OpenAPIComponents;
  security: OpenAPISecurity[];
}

// UI Configuration Interface
export interface UIConfig {
  deepLinking: boolean;
  displayOperationId: boolean;
}

// Swagger Configuration Interface
export interface SwaggerConfig {
  enabled: boolean;
  routePrefix: string;
  openapi: OpenAPIConfig;
  uiConfig: UIConfig;
  staticCSP: boolean;
  transformStaticCSP: string;
}

// CORS Configuration Interface
export interface CORSConfig {
  origin: string;
  credentials: boolean;
  methods: string[];
}

// Rate Limit Configuration Interface
export interface RateLimitConfig {
  max: number | string;
  timeWindow: number | string;
  errorResponseBuilder?: string | Function;
}

// Main Server Configuration Interface
export interface ServerConfig {
  server: ServerBaseConfig;
  logging: LoggingConfig;
  swagger: SwaggerConfig;
  cors: CORSConfig;
  rateLimit: RateLimitConfig;
}
