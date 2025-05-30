interface AuthConfig {
  roles?: { [role: string]: RoleConfig };
  collectionPermissions?: { [collection: string]: CollectionPermissions };
  functionPermissions?: { [functionName: string]: FunctionPermissions };
  jwt?: {
    secret: string;
    expiresIn: string;
    issuer?: string;
    audience?: string;
  };
  rateLimiting?: {
    enabled: boolean;
    defaultLimits: RateLimitConfig;
    roleLimits: { [role: string]: RateLimitConfig };
  };
}

interface RoleConfig {
  includes(arg0: string): unknown;
  collections: RoleConfig;
  name: string;
  description: string;
  permissions: string[];
  inherits?: string[];
  rateLimits?: RateLimitConfig;
}

interface CollectionPermissions {
  read: string[];
  create: string[];
  update: string[];
  delete: string[];
  admin: string[];
}

interface FunctionPermissions {
  execute: string[];
  admin: string[];
}

interface RateLimitConfig {
  requests: number;
  window: string; // e.g., "1h", "15m"
  burst?: number;
}

interface UserPayload {
  sub: string; // User ID
  email?: string;
  role: string;
  permissions?: string[];
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

interface UserContext extends UserPayload {
  collections: string[];
  permissions: string[];
  rateLimits: RateLimitConfig;
  sessionId: string;
}

export {
    AuthConfig,
    RoleConfig,
    CollectionPermissions,
    FunctionPermissions,
    RateLimitConfig,
    UserPayload,
    UserContext
}