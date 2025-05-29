// Common types for MongoREST scripts

export interface MongoRESTEnvironment {
  MONGODB_URI: string;
  MONGODB_DB_NAME: string;
  PORT: number;
  HOST: string;
  NODE_ENV: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  LOG_LEVEL: string;
}

export interface DatabaseConnection {
  uri: string;
  dbName: string;
}

export interface ScriptExecutionResult {
  success: boolean;
  message: string;
  duration?: number;
  error?: string;
  data?: any;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
  totalSchemas: number;
  validSchemas: number;
  totalFunctions: number;
  validFunctions: number;
}

export interface CollectionSchema {
  $schema: string;
  title: string;
  description: string;
  type: string;
  collection: string;
  properties: Record<string, any>;
  required?: string[];
  indexes?: IndexDefinition[];
  mongorest?: MongoRESTConfig;
}

export interface FunctionDefinition {
  name: string;
  description: string;
  category?: string;
  method?: string;
  endpoint?: string;
  permissions?: string[];
  rateLimits?: Record<string, any>;
  steps: FunctionStep[];
  input?: any;
  output?: any;
  timeout?: number;
  caching?: any;
}

export interface FunctionStep {
  id: string;
  type: string;
  collection?: string;
  pipeline?: any[];
  query?: any;
  document?: any;
  update?: any;
  options?: any;
}

export interface IndexDefinition {
  fields: Record<string, number>;
  unique?: boolean;
  sparse?: boolean;
  background?: boolean;
  name?: string;
}

export interface MongoRESTConfig {
  permissions?: Record<string, string[]>;
  rateLimits?: Record<string, RateLimit>;
}

export interface RateLimit {
  requests: number;
  window: string;
}

export interface APITestResult {
  name: string;
  success: boolean;
  duration: number;
  features: string[];
  resultCount: number;
  error?: string;
}

export interface RelationshipTestConfig {
  baseURL: string;
  testToken?: string;
  results: APITestResult[];
}

export interface DocumentationConfig {
  service: string;
  version: string;
  generatedAt: string;
  collections: CollectionDocumentation[];
  functions: FunctionDocumentation[];
  endpoints: EndpointDocumentation[];
}

export interface CollectionDocumentation {
  name: string;
  title: string;
  description: string;
  properties: string[];
  required: string[];
  indexes: IndexDefinition[];
  permissions: Record<string, string[]>;
  rateLimits: Record<string, RateLimit>;
  endpoints: EndpointDocumentation[];
}

export interface FunctionDocumentation {
  name: string;
  description: string;
  category: string;
  method: string;
  endpoint: string;
  permissions: string[];
  rateLimits: Record<string, RateLimit>;
  steps: number;
  stepTypes: string[];
  collections: string[];
  input: any;
  output: any;
  timeout: number;
  caching: any;
}

export interface EndpointDocumentation {
  method: string;
  path: string;
  type: string;
  operation?: string;
  description: string;
  permissions?: string[];
}

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    description: string;
    version: string;
    contact?: {
      name: string;
      url: string;
    };
  };
  servers: Array<{
    url: string;
    description: string;
  }>;
  components: {
    securitySchemes: Record<string, any>;
  };
  security: Array<Record<string, any[]>>;
  paths: Record<string, any>;
}

export interface SampleDataUser {
  _id: any;
  email: string;
  name: string;
  profile: {
    age: number;
    country: string;
    interests: string[];
    avatar?: string;
  };
  status: string;
  lastLogin: string;
  createdAt: string;
  updatedAt: string;
}

export interface SampleDataProduct {
  _id: any;
  sku: string;
  name: string;
  description: string;
  category: string;
  subcategory?: string;
  price: number;
  currency: string;
  inventory: {
    quantity: number;
    reserved: number;
    lowStockThreshold: number;
  };
  images: string[];
  tags: string[];
  specifications: Record<string, any>;
  ratings: {
    average: number;
    count: number;
  };
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface SampleDataOrder {
  _id: any;
  orderNumber: string;
  customerId: any;
  items: OrderItem[];
  shippingAddress: Address;
  billingAddress: Address;
  payment: PaymentInfo;
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  totalAmount: number;
  currency: string;
  status: string;
  orderDate: string;
  shippedDate?: string;
  deliveredDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  productId: any;
  sku: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface Address {
  fullName: string;
  address: string;
  city: string;
  state?: string;
  zipCode?: string;
  country: string;
  phone?: string;
}

export interface PaymentInfo {
  method: string;
  status: string;
  transactionId: string;
  amount: number;
}

export interface SetupConfiguration {
  jwtSecret: string;
  mongoUri: string;
  dbName: string;
  port: number;
  host: string;
  nodeEnv: string;
}

export interface TestTokenPayload {
  sub: string;
  role: string;
  permissions: string[];
  collections: string[];
  functions: string[];
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface BatchScriptRequest {
  id: string;
  script: string;
}

export interface BatchScriptResponse {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
  executionTime?: number;
}

export interface CommandRunner {
  command: string;
  args: string[];
  options?: {
    silent?: boolean;
    stdio?: string | string[];
    shell?: boolean;
  };
}

export type LogLevel = 'info' | 'success' | 'error' | 'warning' | 'process';

export interface Logger {
  log(message: string, type?: LogLevel): void;
}
