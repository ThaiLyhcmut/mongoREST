# MongoREST Relationship System - Quick Start Guide

This guide demonstrates the new relationship system that brings PostgREST-style queries to MongoDB.

## 🚀 Quick Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Generate Sample Data
```bash
npm run generate-sample-data
```

### 3. Start the Server
```bash
npm run dev
```

### 4. Test Relationships
```bash
npm run test:relationships
```

## 🔗 Relationship Query Examples

### Basic Relationships

#### 1. belongsTo Relationship (Order → Customer)
```bash
GET /crud/orders?select=orderNumber,totalAmount,customer(name,email,profile)
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "orderNumber": "ORD-20230201",
      "totalAmount": 2459.97,
      "customer": {
        "name": "John Doe",
        "email": "john.doe@example.com",
        "profile": {
          "age": 30,
          "country": "Vietnam",
          "interests": ["technology", "gaming", "travel"]
        }
      }
    }
  ]
}
```

#### 2. hasMany Relationship (User → Orders)
```bash
GET /crud/users?select=name,email,orders(orderNumber,totalAmount,status)
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "name": "John Doe",
      "email": "john.doe@example.com",
      "orders": [
        {
          "orderNumber": "ORD-20230201",
          "totalAmount": 2459.97,
          "status": "delivered"
        }
      ]
    }
  ]
}
```

#### 3. manyToMany Relationship (Product → Categories)
```bash
GET /crud/products?select=name,price,categories:product_categories.category(name,slug)
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "name": "MacBook Pro 16\"",
      "price": 2399.99,
      "categories": [
        {
          "name": "Electronics",
          "slug": "electronics"
        }
      ]
    }
  ]
}
```

### Advanced Queries

#### 1. Nested Relationships (3+ levels)
```bash
GET /crud/products?select=name,price,reviews(rating,title,user(name,profile(country)))
```

#### 2. Relationship Filtering
```bash
GET /crud/users?select=name,orders(orderNumber,totalAmount)&orders.status=eq.delivered
```

#### 3. Aggregated Relationships
```bash
GET /crud/products?select=name,price,reviewCount:reviews!count,avgRating:reviews!avg(rating)
```

#### 4. Relationship with Modifiers
```bash
GET /crud/users?select=name,recentOrders:orders(orderNumber,totalAmount)!order.orderDate.desc!limit.3
```

### Complex Filtering

#### 1. Multiple Filters
```bash
GET /crud/products?category=eq.electronics&price=lt.1000&select=name,price,reviews(rating)&reviews.rating=gte.4
```

#### 2. Advanced Operators
```bash
GET /crud/users?profile.country=in.(Vietnam,Thailand)&select=name,profile(country),orders(totalAmount)&orders.totalAmount=gte.100
```

## 📋 Supported Query Syntax

### Field Selection
- `select=field1,field2` - Select specific fields
- `select=*` - Select all fields
- `select=relation(*)` - Include all fields from relationship
- `select=relation(field1,field2)` - Select specific fields from relationship

### Relationship Types
- `belongsTo`: One-to-one relationships (order → customer)
- `hasMany`: One-to-many relationships (user → orders)
- `manyToMany`: Many-to-many relationships (product ↔ categories)

### Filter Operators
- `eq` - Equal to
- `neq`, `ne` - Not equal to
- `gt` - Greater than
- `gte` - Greater than or equal
- `lt` - Less than
- `lte` - Less than or equal
- `in` - In array
- `nin` - Not in array
- `like` - Pattern matching
- `regex` - Regular expression

### Relationship Modifiers
- `!order.field.desc` - Sort descending
- `!order.field.asc` - Sort ascending
- `!limit.N` - Limit results
- `!skip.N` - Skip results
- `!count` - Count aggregation
- `!avg(field)` - Average aggregation
- `!sum(field)` - Sum aggregation

## 🔧 Schema Configuration

### Defining Relationships in Schema

```json
{
  "collection": "orders",
  "relationships": {
    "customer": {
      "type": "belongsTo",
      "collection": "users",
      "localField": "customerId",
      "foreignField": "_id",
      "alias": "customer"
    },
    "items": {
      "type": "hasMany",
      "collection": "products",
      "localField": "items.productId",
      "foreignField": "_id",
      "alias": "itemProducts"
    }
  }
}
```

### Many-to-Many Configuration

```json
{
  "collection": "products",
  "relationships": {
    "categories": {
      "type": "manyToMany",
      "collection": "categories",
      "through": "product_categories",
      "localField": "_id",
      "throughLocalField": "productId",
      "throughForeignField": "categoryId",
      "foreignField": "_id",
      "alias": "categories"
    }
  }
}
```

## 🔒 Security & Permissions

Relationship access is controlled by collection-level permissions. Users must have `read` access to both source and target collections to query relationships.

### JWT Token Example
```json
{
  "sub": "user_12345",
  "role": "admin",
  "permissions": ["read", "write"],
  "collections": ["users", "orders", "products"],
  "functions": ["generateReport"]
}
```

## 📊 Performance Tips

1. **Use Indexes**: Ensure foreign key fields are indexed
2. **Limit Results**: Use `!limit.N` for large datasets
3. **Select Specific Fields**: Avoid `select=*` for large documents
4. **Filter Early**: Apply filters on the main collection first

## 🧪 Testing

### Run All Relationship Tests
```bash
npm run test:relationships
```

### Run Specific Test Categories
```bash
node scripts/test-relationships.js basic
node scripts/test-relationships.js relationships
node scripts/test-relationships.js filtering
node scripts/test-relationships.js advanced
```

## 📚 More Examples

Check out the test script for comprehensive examples:
- `/scripts/test-relationships.js` - Complete test suite
- `/scripts/generate-sample-data.js` - Sample data generator

## 🆘 Troubleshooting

### Common Issues

1. **Relationship not found**: Check schema definition and collection names
2. **Permission denied**: Ensure user has read access to target collection
3. **Field not found**: Verify field names exist in target collection
4. **Slow queries**: Add indexes on foreign key fields

### Debug Mode

Set `NODE_ENV=development` to see aggregation pipelines in responses:

```json
{
  "meta": {
    "pipeline": [
      {"$lookup": {"from": "users", "localField": "customerId", "foreignField": "_id", "as": "customer"}},
      {"$project": {"orderNumber": 1, "customer": 1}}
    ]
  }
}
```

---

🎉 **You now have a powerful PostgREST-style relationship system for MongoDB!**

For more detailed documentation, check out `/docs/` or visit the API documentation at `/docs` when the server is running.
