// Authentication and Authorization Middleware
import { FastifyRequest, FastifyReply } from 'fastify';

import {
  AuthConfig,
  RoleConfig,
  CollectionPermissions,
  FunctionPermissions,
  RateLimitConfig,
  UserPayload,
  UserContext
} from '../config/middleware/auth.config';

import SchemaLoader from '../core/schema-loader';

// Extend FastifyRequest to include user context
declare module 'fastify' {
  interface FastifyRequest {
    user: UserContext;
    authContext?: {
      token: string;
      validatedAt: number;
      expiresAt: number;
    };
    customContext: {
      schemaLoader: SchemaLoader 
    }
  }
}

class AuthManager {
  private config: AuthConfig;
  private roles: { [role: string]: RoleConfig };
  private collectionPermissions: { [collection: string]: CollectionPermissions };
  private functionPermissions: { [functionName: string]: FunctionPermissions };

  constructor(authConfig: AuthConfig) {
    this.config = authConfig;
    this.roles = authConfig.roles || {};
    this.collectionPermissions = authConfig.collectionPermissions || {};
    this.functionPermissions = authConfig.functionPermissions || {};
  }

  // Middleware for JWT authentication
  authenticate() {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        // Verify JWT token using Fastify JWT plugin
        await request.jwtVerify();
        
        // Validate user payload
        this.validateUserPayload(request.user as UserPayload);
        
        // Enhance user context
        const user = request.user as UserPayload;
        const enhancedUser: UserContext = {
          ...user,
          permissions: this.getUserPermissions(user),
          rateLimits: this.getUserRateLimit(user),
          sessionId: this.generateSessionId(user),
          collections: []
        };

        request.user = enhancedUser;
        
        // Store auth context
        request.authContext = {
          token: this.extractToken(request),
          validatedAt: Date.now(),
          expiresAt: (user.exp || 0) * 1000
        };
        
        request.log.info('User authenticated successfully', {
          userId: user.sub,
          role: user.role,
          permissions: enhancedUser.permissions.length
        });
        
      } catch (error: any) {
        request.log.warn('Authentication failed', { error: error.message });
        reply.code(401).send({
          error: 'Authentication failed',
          message: error.message,
          suggestion: 'Provide a valid JWT token in Authorization header'
        });
      }
    };
  }

  // Middleware for role-based authorization
  authorize(requiredPermission: string) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const user = request.user;
      
      if (!user) {
        return reply.code(401).send({
          error: 'Authentication required',
          message: 'No user context found'
        });
      }

      if (!this.hasPermission(user, requiredPermission)) {
        request.log.warn('Authorization failed', {
          userId: user.sub,
          requiredPermission,
          userRole: user.role,
          userPermissions: user.permissions
        });

        return reply.code(403).send({
          error: 'Insufficient permissions',
          message: `Required permission: ${requiredPermission}`,
          userRole: user.role,
          userPermissions: user.permissions,
          suggestion: 'Contact administrator to request additional permissions'
        });
      }

      request.log.debug('Authorization successful', {
        userId: user.sub,
        permission: requiredPermission
      });
    };
  }

  // Middleware for collection-specific authorization
  authorizeCollection(collection: string, operation: 'read' | 'create' | 'update' | 'delete' | 'admin') {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const user = request.user;
      
      if (!user) {
        return reply.code(401).send({
          error: 'Authentication required',
          message: 'No user context found'
        });
      }

      if (!this.hasCollectionPermission(user, collection, operation)) {
        request.log.warn('Collection authorization failed', {
          userId: user.sub,
          collection,
          operation,
          userRole: user.role
        });

        return reply.code(403).send({
          error: 'Insufficient collection permissions',
          message: `Operation '${operation}' not allowed on collection '${collection}'`,
          collection,
          operation,
          userRole: user.role,
          suggestion: `Request '${operation}' permission for collection '${collection}'`
        });
      }

      request.log.debug('Collection authorization successful', {
        userId: user.sub,
        collection,
        operation
      });
    };
  }

  // Middleware for function-specific authorization
  authorizeFunction(functionName: string) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const user = request.user;
      
      if (!user) {
        return reply.code(401).send({
          error: 'Authentication required',
          message: 'No user context found'
        });
      }

      if (!this.hasFunctionPermission(user, functionName)) {
        request.log.warn('Function authorization failed', {
          userId: user.sub,
          functionName,
          userRole: user.role
        });

        return reply.code(403).send({
          error: 'Insufficient function permissions',
          message: `Function '${functionName}' execution not allowed`,
          functionName,
          userRole: user.role,
          suggestion: `Request execution permission for function '${functionName}'`
        });
      }

      request.log.debug('Function authorization successful', {
        userId: user.sub,
        functionName
      });
    };
  }

  // Middleware for rate limiting
  applyRateLimit() {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!this.config.rateLimiting?.enabled) {
        return; // Skip if rate limiting is disabled
      }

      const user = request.user;
      if (!user) {
        return; // Skip if no user context (authentication should handle this)
      }

      try {
        const limits = user.rateLimits;
        const key = `ratelimit:${user.sub}`;
        const window = this.parseTimeWindow(limits.window);
        
        // Simple in-memory rate limiting (in production, use Redis)
        const now = Date.now();
        const requests = await this.getRequestCount(key, window);
        
        if (requests >= limits.requests) {
          const resetTime = await this.getRateLimitReset(key, window);
          
          reply.header('X-RateLimit-Limit', limits.requests.toString());
          reply.header('X-RateLimit-Remaining', '0');
          reply.header('X-RateLimit-Reset', resetTime.toString());
          
          return reply.code(429).send({
            error: 'Rate limit exceeded',
            message: `Too many requests. Limit: ${limits.requests} per ${limits.window}`,
            retryAfter: Math.ceil((resetTime - now) / 1000),
            limits: {
              requests: limits.requests,
              window: limits.window,
              remaining: 0
            }
          });
        }

        // Increment request count
        await this.incrementRequestCount(key, window);
        
        // Set rate limit headers
        const remaining = limits.requests - requests - 1;
        reply.header('X-RateLimit-Limit', limits.requests.toString());
        reply.header('X-RateLimit-Remaining', remaining.toString());

      } catch (error: any) {
        request.log.error('Rate limiting error:', error);
        // Continue request on rate limit error (fail open)
      }
    };
  }

  // Validate user payload structure
  private validateUserPayload(user: any): void {
    if (!user || typeof user !== 'object') {
      throw new Error('Invalid user payload');
    }

    if (!user.sub) {
      throw new Error('User ID (sub) is required');
    }

    if (!user.role) {
      throw new Error('User role is required');
    }

    if (!this.roles[user.role]) {
      throw new Error(`Invalid user role: ${user.role}`);
    }
  }

  // Get user permissions based on role
  private getUserPermissions(user: UserPayload): string[] {
    const role = this.roles[user.role];
    if (!role) return [];

    let permissions = [...role.permissions];

    // Add inherited permissions
    if (role.inherits) {
      for (const inheritedRole of role.inherits) {
        const inherited = this.roles[inheritedRole];
        if (inherited) {
          permissions.push(...inherited.permissions);
        }
      }
    }

    // Add explicit user permissions
    if (user.permissions) {
      permissions.push(...user.permissions);
    }

    // Remove duplicates
    return Array.from(new Set(permissions));
  }

  // Get user rate limits
  private getUserRateLimit(user: UserPayload): RateLimitConfig {
    const role = this.roles[user.role];
    
    // Role-specific limits override defaults
    if (role?.rateLimits) {
      return role.rateLimits;
    }

    // Check configuration for role-specific limits
    if (this.config.rateLimiting?.roleLimits?.[user.role]) {
      return this.config.rateLimiting.roleLimits[user.role];
    }

    // Fall back to default limits
    return this.config.rateLimiting?.defaultLimits || {
      requests: 100,
      window: '1h'
    };
  }

  // Check if user has specific permission
  private hasPermission(user: UserContext, permission: string): boolean {
    return user.permissions.includes(permission) || 
           user.permissions.includes('admin') ||
           user.permissions.includes('*');
  }

  // Check if user has collection permission
  private hasCollectionPermission(user: UserContext, collection: string, operation: string): boolean {
    const collectionPerms = this.collectionPermissions[collection];
    if (!collectionPerms) {
      return true; // Allow if no specific permissions defined
    }

    const requiredRoles = collectionPerms[operation as keyof CollectionPermissions] || [];
    return requiredRoles.includes(user.role) || 
           requiredRoles.includes('*') ||
           this.hasPermission(user, 'admin');
  }

  // Check if user has function permission
  private hasFunctionPermission(user: UserContext, functionName: string): boolean {
    const functionPerms = this.functionPermissions[functionName];
    if (!functionPerms) {
      return true; // Allow if no specific permissions defined
    }

    return functionPerms.execute.includes(user.role) ||
           functionPerms.execute.includes('*') ||
           this.hasPermission(user, 'admin');
  }

  // Generate session ID
  private generateSessionId(user: UserPayload): string {
    return `session_${user.sub}_${Date.now()}`;
  }

  // Extract token from request
  private extractToken(request: FastifyRequest): string {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return '';
  }

  // Parse time window string to milliseconds
  private parseTimeWindow(window: string): number {
    const match = window.match(/^(\d+)([smhd])$/);
    if (!match) return 3600000; // Default 1 hour

    const [, value, unit] = match;
    const multipliers: { [key: string]: number } = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000
    };

    return parseInt(value) * multipliers[unit];
  }

  // Simple in-memory rate limiting (replace with Redis in production)
  private requestCounts: Map<string, { count: number; resetTime: number }> = new Map();

  private async getRequestCount(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const data = this.requestCounts.get(key);
    
    if (!data || now > data.resetTime) {
      return 0;
    }
    
    return data.count;
  }

  private async incrementRequestCount(key: string, windowMs: number): Promise<void> {
    const now = Date.now();
    const data = this.requestCounts.get(key);
    
    if (!data || now > data.resetTime) {
      this.requestCounts.set(key, {
        count: 1,
        resetTime: now + windowMs
      });
    } else {
      data.count++;
    }
  }

  private async getRateLimitReset(key: string, windowMs: number): Promise<number> {
    const data = this.requestCounts.get(key);
    return data?.resetTime || (Date.now() + windowMs);
  }

  // Get user rate limits for external use
  getRateLimit(user: UserContext): RateLimitConfig {
    return user.rateLimits;
  }

  canAccessCollection(user: UserContext, collection: string, operation: 'read' | 'create' | 'update' | 'delete' | 'admin') {
    // Admin has access to everything
    if (user.role === 'admin') {
      return true;
    }

    // Check role-level collection access
    const roleConfig = this.roles[user.role];
    if (roleConfig && roleConfig.collections) {
      if (roleConfig.collections.includes('*') || roleConfig.collections.includes(collection)) {
        // Check if role has the required operation permission
        if (roleConfig.permissions.includes('*') || roleConfig.permissions.includes(operation)) {
          return true;
        }
      }
    }

    // Check collection-specific permissions
    const collectionPerms = this.collectionPermissions[collection];
    if (collectionPerms && collectionPerms[operation]) {
      return collectionPerms[operation].includes(user.role);
    }

    // Check user-specific permissions (from JWT token)
    if (user.collections && user.permissions) {
      const hasCollection = user.collections.includes('*') || user.collections.includes(collection);
      const hasOperation = user.permissions.includes('*') || user.permissions.includes(operation);
      return hasCollection && hasOperation;
    }

    return false;
  }

  canAccessRelationship(user: UserContext, sourceCollection: string, relationshipName: string | undefined, targetCollection: string) {
    // Admin has access to everything
    if (user.role === 'admin') {
      return true;
    }

    // Must have read access to both source and target collections
    const canReadSource = this.canAccessCollection(user, sourceCollection, 'read');
    const canReadTarget = this.canAccessCollection(user, targetCollection, 'read');
    
    if (!canReadSource || !canReadTarget) {
      return false;
    }

    // Additional relationship-specific restrictions could be added here
    // For now, if user can read both collections, they can access the relationship
    return true;
  }

  authorizeRelationships() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user;
      
      if (!user) {
        return reply.code(401).send({
          error: 'Authentication required'
        });
      }

      // Check if request has relationship queries
      if (!request.relationshipQuery || !request.relationshipQuery.fields) {
        return; // No relationships to authorize
      }

      const sourceCollection = (request.params as any)?.collection || 
                              request.routerPath.split('/').pop();
      
      // Check each relationship in the query
      for (const field of request.relationshipQuery.fields) {
        if (field.type === 'relationship' || field.type === 'aggregate') {
          const relationName = field.relationName || field.alias;
          
          // Get relationship definition from schema
          const schemaLoader = request.customContext.schemaLoader;
          const schema = schemaLoader.getSchema(sourceCollection);
          const relationship = relationName ? schema?.relationships?.[relationName] : undefined;
          
          if (relationship) {
            const canAccess = this.canAccessRelationship(
              user, 
              sourceCollection, 
              relationName, 
              relationship.collection
            );
            
            if (!canAccess) {
              return reply.code(403).send({
                error: 'Relationship access denied',
                message: `You don't have permission to access relationship '${relationName}'`,
                sourceCollection,
                targetCollection: relationship.collection,
                userRole: user.role
              });
            }
          }
        }
      }
    };
  }
}

export default AuthManager;
