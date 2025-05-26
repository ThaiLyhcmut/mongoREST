# MongoREST - PostgREST for MongoDB

MongoREST is a standalone server that automatically generates a RESTful API from your MongoDB schema definitions, inspired by PostgREST's philosophy for PostgreSQL.

## 🚀 Quick Start

### Installation

```bash
cd /Users/vudinh/Documents/code/mongoREST
npm install
```

### Environment Setup

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

Edit `.env` file:
```bash
# Database Configuration
MONGODB_URI=mongodb://localhost:27017/mongorest
MONGODB_DB_NAME=mongorest

# Server Configuration
PORT=3000
HOST=localhost
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your-super-secret-key-change-this-in-production
JWT_EXPIRES_IN=24h

# Logging
LOG_LEVEL=info
```

### Start the Server

```bash
# Development mode with hot reload
npm run dev

# Production mode
npm start
```

The server will start at `http://localhost:3000`

## 📚 API Endpoints

### Core Endpoints

- **Root**: `GET /` - Service information and available endpoints
- **Documentation**: `GET /docs` - Interactive Swagger UI
- **Health Check**: `GET /health` - Basic health status
- **Detailed Health**: `GET /health/status` - Comprehensive system status

### CRUD Operations

For each collection defined in `schemas/collections/`, the following endpoints are automatically generated:

- `GET /crud/{collection}` - List documents with filtering, sorting, pagination
- `GET /crud/{collection}/{id}` - Get single document by ID
- `POST /crud/{collection}` - Create new document
- `PUT /crud/{collection}/{id}` - Replace entire document
- `PATCH /crud/{collection}/{id}` - Partial update document
- `DELETE /crud/{collection}/{id}` - Delete document by ID

### Function Execution

- `GET /functions` - List all available custom functions
- `POST /functions/{functionName}` - Execute specific function
- `GET /functions/{functionName}` - Get function details

### Script Execution (NEW!)

- `POST /scripts/execute` - Execute raw MongoDB scripts
- `POST /scripts/batch` - Execute multiple scripts
- `POST /scripts/validate` - Validate script without execution
- `GET /scripts/history` - Get script execution history

## 🔧 Usage Examples

### 1. Basic CRUD Operations

```bash
# Create a user
curl -X POST http://localhost:3000/crud/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "profile": {
      "age": 30,
      "country": "Vietnam"
    }
  }'

# List users with filtering
curl "http://localhost:3000/crud/users?profile.country=Vietnam&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Update user
curl -X PATCH http://localhost:3000/crud/users/USER_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"profile.age": 31}'
```

### 2. MongoDB Script Execution

MongoREST supports executing raw MongoDB shell scripts:

```bash
# Execute MongoDB script
curl -X POST http://localhost:3000/scripts/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "script": "db.users.find({\"profile.country\": \"Vietnam\"}).sort({createdAt: -1}).limit(5)"
  }'

# Complex aggregation script
curl -X POST http://localhost:3000/scripts/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "script": "db.orders.aggregate([{$match: {status: \"completed\"}}, {$group: {_id: \"$customerId\", total: {$sum: \"$amount\"}}}])"
  }'

# Validate script
curl -X POST http://localhost:3000/scripts/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "script": "db.users.updateMany({status: \"inactive\"}, {$set: {deletedAt: new Date()}})"
  }'
```

### 3. Function Execution

```bash
# Execute user analytics function
curl -X POST http://localhost:3000/functions/generateUserReport \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "dateRange": {
      "start": "2024-01-01",
      "end": "2024-12-31"
    },
    "segments": ["country", "age_group"]
  }'
```

### 4. Batch Operations

```bash
# Execute multiple scripts
curl -X POST http://localhost:3000/scripts/batch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "scripts": [
      {
        "id": "get_users",
        "script": "db.users.find({status: \"active\"}).limit(10)"
      },
      {
        "id": "get_orders", 
        "script": "db.orders.find({status: \"pending\"}).limit(5)"
      }
    ],
    "options": {
      "stopOnError": true
    }
  }'
```

## 🔐 Authentication

MongoREST uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```bash
Authorization: Bearer YOUR_JWT_TOKEN
```

### JWT Payload Structure

```json
{
  "sub": "user_12345",
  "role": "admin",
  "permissions": ["users:read", "users:write"],
  "collections": ["users", "orders", "products"],
  "functions": ["generateUserReport"],
  "iat": 1640995200,
  "exp": 1641081600,
  "iss": "mongorest",
  "aud": "mongorest-api"
}
```

### Available Roles

- **admin**: Full system access
- **dev**: Development access with script execution
- **analyst**: Analytics and reporting access
- **user**: Standard user access

## 📋 Schema Definition

### Collection Schemas

Place your collection schemas in `schemas/collections/`. Example:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Users Collection",
  "type": "object",
  "collection": "users",
  "indexes": [
    { "fields": { "email": 1 }, "unique": true },
    { "fields": { "createdAt": -1 } }
  ],
  "properties": {
    "_id": { "type": "string", "pattern": "^[0-9a-fA-F]{24}$" },
    "email": { "type": "string", "format": "email" },
    "name": { "type": "string", "minLength": 2, "maxLength": 100 },
    "profile": {
      "type": "object",
      "properties": {
        "age": { "type": "integer", "minimum": 13, "maximum": 120 },
        "country": { "type": "string", "enum": ["Vietnam", "Thailand"] }
      }
    }
  },
  "required": ["email", "name", "profile"],
  "mongorest": {
    "permissions": {
      "read": ["user", "admin"],
      "create": ["admin"],
      "update": ["admin"],
      "delete": ["admin"]
    }
  }
}
```

### Function Definitions

Define custom functions in `schemas/functions/`. Example:

```json
{
  "name": "generateUserReport",
  "description": "Generate user analytics report",
  "method": "POST",
  "permissions": ["admin", "analyst"],
  "input": {
    "type": "object",
    "properties": {
      "dateRange": {
        "type": "object",
        "properties": {
          "start": { "type": "string", "format": "date" },
          "end": { "type": "string", "format": "date" }
        }
      }
    }
  },
  "steps": [
    {
      "id": "getUserStats",
      "type": "aggregate",
      "collection": "users",
      "pipeline": [
        {
          "$match": {
            "createdAt": {
              "$gte": "{{params.dateRange.start}}",
              "$lte": "{{params.dateRange.end}}"
            }
          }
        }
      ]
    }
  ]
}
```

## 🔥 Advanced Features

### Script Complexity Analysis

MongoREST analyzes script complexity and applies appropriate limits:

- **Complexity Score**: 1-10 based on operations, nesting, and aggregation stages
- **Role-based Limits**: Different complexity limits per user role
- **Rate Limiting**: Scripts are rate-limited based on complexity

### Security Features

- **Script Validation**: Dangerous operators (`$where`, `$eval`) are blocked
- **Permission Checking**: Collection and operation-level permissions
- **Audit Logging**: All script executions are logged
- **Input Sanitization**: Automatic sanitization of dangerous inputs

### Performance Optimizations

- **Schema Caching**: Schemas loaded in memory for fast access
- **Connection Pooling**: Efficient MongoDB connection management
- **Query Optimization**: Automatic index suggestions and hints

## 🐛 Development

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint
npm run lint:fix
```

### Schema Validation

```bash
npm run validate-schemas
```

### API Documentation Generation

```bash
npm run build-docs
```

## 📊 Monitoring

### Health Checks

```bash
# Basic health
curl http://localhost:3000/health

# Detailed system status
curl http://localhost:3000/health/status

# Database health
curl http://localhost:3000/health/database

# Schema validation status
curl http://localhost:3000/health/schemas
```

### Metrics (Admin only)

```bash
curl http://localhost:3000/health/metrics \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN"
```

## 🔄 Migration from Direct MongoDB

If you're migrating from direct MongoDB usage, MongoREST provides several migration paths:

### 1. Direct Script Execution

Keep your existing MongoDB scripts and execute them through the `/scripts/execute` endpoint.

### 2. Gradual Migration

Start with script execution, then gradually migrate to REST endpoints as you define schemas.

### 3. Batch Migration

Use the batch script execution feature to migrate multiple operations at once.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details.

## 🆘 Support

- **Documentation**: `/docs` endpoint for interactive API documentation
- **Health Checks**: `/health/*` endpoints for system monitoring
- **Logging**: Comprehensive logging for debugging

## 🎯 Roadmap

- [ ] Real-time subscriptions (WebSocket)
- [ ] GraphQL endpoint generation
- [ ] Advanced caching strategies
- [ ] Plugin system
- [ ] Multi-tenancy support
- [ ] Advanced analytics dashboard

---

**MongoREST** brings the power and simplicity of PostgREST to the MongoDB ecosystem! 🚀
