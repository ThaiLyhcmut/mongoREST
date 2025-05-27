class AuthManager {
  constructor(authConfig) {
    this.config = authConfig;
    this.roles = authConfig.roles || {};
    this.collectionPermissions = authConfig.collectionPermissions || {};
    this.functionPermissions = authConfig.functionPermissions || {};
  }

  // Middleware for JWT authentication
  authenticate() {
    return async (request, reply) => {
      try {
        // Verify JWT token
        await request.jwtVerify();

        // Validate user payload
        this.validateUserPayload(request.user);

        // Add user context
        request.user.permissions = this.getUserPermissions(request.user);
      } catch (error) {
        reply.code(401).send({
          error: 'Authentication failed',
          message: error.message
        });
      }
    };
  }

  // Middleware for role-based authorization
  authorize(requiredPermission) {
    return async (request, reply) => {
      const user = request.user;

      if (!user) {
        return reply.code(401).send({
          error: 'Authentication required',
          message: 'No user context found'
        });
      }

      if (!this.hasPermission(user, requiredPermission)) {
        return reply.code(403).send({
          error: 'Insufficient permissions',
          message: `Required permission: ${requiredPermission}`,
          userRole: user.role,
          userPermissions: user.permissions
        });
      }
    };
  }

  // Middleware for collection-level authorization
  authorizeCollection(operation) {
    return async (request, reply) => {
      const user = request.user;
      const collection = request.params.collection;

      if (!user) {
        return reply.code(401).send({
          error: 'Authentication required'
        });
      }

      if (!this.canAccessCollection(user, collection, operation)) {
        return reply.code(403).send({
          error: 'Collection access denied',
          collection,
          operation,
          userRole: user.role,
          message: `You don't have ${operation} access to collection '${collection}'`
        });
      }
    };
  }

  // Middleware for function-level authorization
  authorizeFunction(functionName) {
    return async (request, reply) => {
      const user = request.user;

      if (!user) {
        return reply.code(401).send({
          error: 'Authentication required'
        });
      }

      if (!this.canExecuteFunction(user, functionName)) {
        return reply.code(403).send({
          error: 'Function execution denied',
          function: functionName,
          userRole: user.role,
          message: `You don't have permission to execute function '${functionName}'`
        });
      }
    };
  }

  // Validate JWT payload structure
  validateUserPayload(user) {
    const requiredFields = ['sub', 'role'];
    const missingFields = requiredFields.filter(field => !user[field]);

    if (missingFields.length > 0) {
      throw new Error(`Invalid JWT payload. Missing fields: ${missingFields.join(', ')}`);
    }

    // Validate role exists
    if (!this.roles[user.role]) {
      throw new Error(`Invalid role: ${user.role}`);
    }

    return true;
  }

  // Get user permissions based on role
  getUserPermissions(user) {
    const roleConfig = this.roles[user.role];
    if (!roleConfig) {
      return [];
    }

    // Return explicit permissions from token or role config
    return user.permissions || roleConfig.permissions || [];
  }

  // Check if user has specific permission
  hasPermission(user, requiredPermission) {
    const userPermissions = user.permissions || this.getUserPermissions(user);

    // Admin role has all permissions
    if (user.role === 'admin' || userPermissions.includes('*')) {
      return true;
    }

    // Check explicit permission
    return userPermissions.includes(requiredPermission);
  }

  // Check collection access permission
  canAccessCollection(user, collection, operation) {
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

  // Check function execution permission
  canExecuteFunction(user, functionName) {
    // Admin has access to everything
    if (user.role === 'admin') {
      return true;
    }

    // Check role-level function access
    const roleConfig = this.roles[user.role];
    if (roleConfig && roleConfig.functions) {
      if (roleConfig.functions.includes('*') || roleConfig.functions.includes(functionName)) {
        return true;
      }
    }

    // Check function-specific permissions
    const functionPerms = this.functionPermissions[functionName];
    if (functionPerms) {
      return functionPerms.includes(user.role);
    }

    // Check user-specific function permissions (from JWT token)
    if (user.functions) {
      return user.functions.includes('*') || user.functions.includes(functionName);
    }

    return false;
  }

  // Check relationship access permission
  canAccessRelationship(user, sourceCollection, relationshipName, targetCollection) {
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

  // Middleware for relationship authorization
  authorizeRelationships() {
    return async (request, reply) => {
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

      const sourceCollection = request.params.collection
                              || request.routerPath.split('/').pop();

      // Check each relationship in the query
      for (const field of request.relationshipQuery.fields) {
        if (field.type === 'relationship' || field.type === 'aggregate') {
          const relationName = field.relationName || field.alias;

          // Get relationship definition from schema
          const schemaLoader = request.context.schemaLoader;
          const schema = schemaLoader.getSchema(sourceCollection);
          const relationship = schema?.relationships?.[relationName];

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

  // Rate limiting based on user role
  getRateLimit(user) {
    const roleConfig = this.roles[user.role];
    if (roleConfig && roleConfig.rateLimits) {
      return roleConfig.rateLimits;
    }

    // Default rate limits
    return {
      requests: 100,
      window: '1h'
    };
  }

  // Create rate limiting middleware for specific user
  createRateLimiter(user) {
    const limits = this.getRateLimit(user);

    return {
      max: limits.requests,
      timeWindow: this.parseTimeWindow(limits.window),
      keyGenerator: (request) => `${user.sub}:${user.role}`,
      errorResponseBuilder: (request, context) => ({
        error: 'Rate limit exceeded',
        message: `Too many requests. Limit: ${limits.requests} per ${limits.window}`,
        retryAfter: Math.round(context.ttl / 1000)
      })
    };
  }

  // Parse time window string to milliseconds
  parseTimeWindow(window) {
    const match = window.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 3600000; // Default 1 hour
    }

    const [, value, unit] = match;
    const multipliers = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000
    };

    return parseInt(value) * multipliers[unit];
  }

  // Generate JWT token (for testing/development)
  generateToken(payload, fastify) {
    const tokenPayload = {
      sub: payload.userId || payload.sub,
      role: payload.role,
      permissions: payload.permissions || this.getUserPermissions({ role: payload.role }),
      collections: payload.collections || this.roles[payload.role]?.collections || [],
      functions: payload.functions || this.roles[payload.role]?.functions || [],
      iat: Math.floor(Date.now() / 1000),
      iss: 'mongorest',
      aud: 'mongorest-api'
    };

    return fastify.jwt.sign(tokenPayload);
  }

  // Middleware to add user-specific rate limiting
  userRateLimit() {
    return async (request, reply) => {
      if (!request.user) {
        return; // Skip if not authenticated
      }

      const limits = this.getRateLimit(request.user);
      const key = `ratelimit:${request.user.sub}:${request.user.role}`;

      // This would integrate with Redis or memory cache for production
      // For now, we rely on Fastify's built-in rate limiting
      request.rateLimit = {
        max: limits.requests,
        timeWindow: this.parseTimeWindow(limits.window)
      };
    };
  }

  // Get user context information
  getUserContext(user) {
    const roleConfig = this.roles[user.role];

    return {
      userId: user.sub,
      role: user.role,
      permissions: user.permissions || roleConfig?.permissions || [],
      collections: user.collections || roleConfig?.collections || [],
      functions: user.functions || roleConfig?.functions || [],
      rateLimits: roleConfig?.rateLimits || { requests: 100, window: '1h' },
      isAdmin: user.role === 'admin'
    };
  }

  // Check if operation is allowed for user on specific document
  canAccessDocument(user, collection, document, operation) {
    // Basic collection access check first
    if (!this.canAccessCollection(user, collection, operation)) {
      return false;
    }

    // Document-level security can be implemented here
    // For example, check if user owns the document
    if (document.userId && document.userId !== user.sub && user.role !== 'admin') {
      return false;
    }

    return true;
  }

  // Log security events
  logSecurityEvent(event, user, details = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      user: {
        id: user?.sub,
        role: user?.role
      },
      details,
      severity: this.getEventSeverity(event)
    };

    console.log('🔒 Security Event:', JSON.stringify(logEntry));

    // In production, send to security monitoring system
    // this.sendToSecurityMonitoring(logEntry);
  }

  getEventSeverity(event) {
    const severityMap = {
      auth_failed: 'medium',
      permission_denied: 'medium',
      invalid_token: 'high',
      rate_limit_exceeded: 'low',
      admin_action: 'high'
    };

    return severityMap[event] || 'low';
  }

  // Helper method to create test tokens for development
  createTestTokens(fastify) {
    if (process.env.NODE_ENV !== 'development') {
      return {};
    }

    const tokens = {};

    for (const [roleName, roleConfig] of Object.entries(this.roles)) {
      tokens[roleName] = this.generateToken({
        userId: `test_${roleName}_user`,
        role: roleName
      }, fastify);
    }

    return tokens;
  }
}

export default AuthManager;
