# MongoREST - Use Cases và Examples

*Practical Guide với Real-world Examples*

---

## 📋 Mục Lục

1. [E-commerce Platform](#e-commerce-platform)
2. [Blog/CMS System](#blogcms-system)
3. [Analytics Dashboard](#analytics-dashboard)
4. [Social Media App](#social-media-app)
5. [Enterprise Resource Planning](#enterprise-resource-planning)
6. [Best Practices](#best-practices)

---

## 🛒 E-commerce Platform

### Schema Design

#### Products Collection
```json
{
  "title": "Products",
  "collection": "products", 
  "properties": {
    "_id": { "type": "string" },
    "name": { "type": "string", "maxLength": 200 },
    "description": { "type": "string", "maxLength": 2000 },
    "price": { "type": "number", "minimum": 0 },
    "sku": { "type": "string", "pattern": "^[A-Z0-9-]+$" },
    "stock": { "type": "integer", "minimum": 0 },
    "status": { "type": "string", "enum": ["active", "inactive", "discontinued"] }
  },
  "relationships": {
    "category": {
      "type": "belongsTo", 
      "collection": "categories",
      "localField": "categoryId",
      "foreignField": "_id"
    },
    "reviews": {
      "type": "hasMany",
      "collection": "reviews", 
      "localField": "_id",
      "foreignField": "productId",
      "defaultSort": { "createdAt": -1 },
      "pagination": { "defaultLimit": 10, "maxLimit": 50 }
    },
    "orders": {
      "type": "hasMany",
      "collection": "orders",
      "localField": "_id", 
      "foreignField": "items.productId",
      "pipeline": [
        { "$unwind": "$items" },
        { "$match": { "items.productId": "{{localValue}}" } }
      ]
    }
  }
}
```

### Practical Use Cases

#### 1. Product Listing với Category Info
```bash
# Lấy products với thông tin category
GET /crud/products?select=name,price,stock,category(name,slug)&status=eq.active

# Response
{
  "success": true,
  "data": [
    {
      "name": "iPhone 15 Pro",
      "price": 999,
      "stock": 25,
      "category": {
        "name": "Smartphones", 
        "slug": "smartphones"
      }
    }
  ]
}
```

#### 2. Product Search với Filters
```bash
# Tìm kiếm products theo category và price range
GET /crud/products?select=name,price,category(name)&category.featured=eq.true&price=gte.100&price=lte.500&search=phone

# Kết quả: Products có category featured, giá từ $100-500, chứa từ "phone"
```

#### 3. Product Details với Reviews
```bash
# Chi tiết product với reviews và rating trung bình
GET /crud/products/60f7b3b3b3b3b3b3b3b3b3b3?select=*,reviews(*),avgRating:reviews!avg(rating),reviewCount:reviews!count

# Response bao gồm tất cả thông tin product + reviews + statistics
```

#### 4. Category-based Navigation
```bash
# Lấy categories với số lượng products
GET /crud/categories?select=name,slug,productCount:products!count&status=eq.active

# Hierarchy categories
GET /crud/categories?select=name,slug,children(name,slug,productCount:products!count)&parentId=null
```

### Custom Functions cho E-commerce

#### Inventory Management Function
```json
{
  "name": "updateInventory",
  "description": "Update product inventory after order",
  "method": "POST",
  "input": {
    "type": "object",
    "properties": {
      "items": {
        "type": "array",
        "items": {
          "type": "object", 
          "properties": {
            "productId": { "type": "string" },
            "quantity": { "type": "integer" }
          }
        }
      }
    }
  },
  "steps": [
    {
      "id": "validateStock",
      "type": "find",
      "collection": "products",
      "query": {
        "_id": { "$in": "{{params.items.map(i => i.productId)}}" }
      }
    },
    {
      "id": "updateStock", 
      "type": "updateMany",
      "collection": "products",
      "operations": "{{buildUpdateOperations(params.items)}}"
    },
    {
      "id": "logChanges",
      "type": "insertMany",
      "collection": "inventory_logs",
      "documents": "{{buildLogEntries(params.items)}}"
    }
  ]
}
```

#### Sales Analytics Function
```json
{
  "name": "salesReport",
  "description": "Generate sales analytics report",
  "method": "POST",
  "steps": [
    {
      "id": "orderStats",
      "type": "aggregate",
      "collection": "orders",
      "pipeline": [
        { "$match": { "status": "completed", "createdAt": { "$gte": "{{params.startDate}}" } } },
        { "$group": {
          "_id": { "$dateToString": { "format": "%Y-%m-%d", "date": "$createdAt" } },
          "totalSales": { "$sum": "$totalAmount" },
          "orderCount": { "$sum": 1 }
        }},
        { "$sort": { "_id": 1 } }
      ]
    },
    {
      "id": "topProducts",
      "type": "aggregate", 
      "collection": "orders",
      "pipeline": [
        { "$unwind": "$items" },
        { "$group": {
          "_id": "$items.productId",
          "totalSold": { "$sum": "$items.quantity" },
          "revenue": { "$sum": "$items.subtotal" }
        }},
        { "$sort": { "totalSold": -1 } },
        { "$limit": 10 }
      ]
    }
  ]
}
```

---

## 📝 Blog/CMS System

### Schema Design

#### Posts Collection
```json
{
  "title": "Blog Posts",
  "collection": "posts",
  "properties": {
    "_id": { "type": "string" },
    "title": { "type": "string", "maxLength": 200 },
    "slug": { "type": "string", "pattern": "^[a-z0-9-]+$" },
    "content": { "type": "string" },
    "excerpt": { "type": "string", "maxLength": 500 },
    "status": { "type": "string", "enum": ["draft", "published", "archived"] },
    "publishedAt": { "type": "string", "format": "date-time" },
    "authorId": { "type": "string", "pattern": "^[0-9a-fA-F]{24}$" }
  },
  "relationships": {
    "author": {
      "type": "belongsTo",
      "collection": "users", 
      "localField": "authorId",
      "foreignField": "_id"
    },
    "categories": {
      "type": "manyToMany",
      "collection": "categories",
      "through": "post_categories",
      "localField": "_id",
      "throughLocalField": "postId", 
      "throughForeignField": "categoryId",
      "foreignField": "_id"
    },
    "comments": {
      "type": "hasMany",
      "collection": "comments",
      "localField": "_id",
      "foreignField": "postId",
      "defaultFilters": { "status": "approved" },
      "defaultSort": { "createdAt": -1 }
    }
  }
}
```

### Practical Use Cases

#### 1. Blog Homepage
```bash
# Latest published posts với author info
GET /crud/posts?select=title,slug,excerpt,publishedAt,author(name,avatar)&status=eq.published&sort=publishedAt&order=desc&limit=10

# Response
{
  "data": [
    {
      "title": "Getting Started with MongoREST",
      "slug": "getting-started-mongorest", 
      "excerpt": "Learn how to build APIs with MongoREST...",
      "publishedAt": "2025-01-15T10:00:00Z",
      "author": {
        "name": "John Doe",
        "avatar": "https://example.com/avatars/john.jpg"
      }
    }
  ]
}
```

#### 2. Post Detail Page
```bash
# Full post với author, categories, và comments
GET /crud/posts/60f7b3b3b3b3b3b3b3b3b3b3?select=title,content,publishedAt,author(name,bio,avatar),categories(name,slug),comments(content,author(name),createdAt)!limit.20

# Kết quả: Complete post data với related information
```

#### 3. Category Archive
```bash
# Posts trong một category cụ thể
GET /crud/posts?select=title,slug,excerpt,author(name),publishedAt&categories.slug=eq.technology&status=eq.published&sort=publishedAt&order=desc

# Author's posts
GET /crud/posts?select=title,slug,excerpt,publishedAt&author.slug=eq.john-doe&status=eq.published
```

#### 4. Search Functionality
```bash
# Search posts by title/content
GET /crud/posts?select=title,slug,excerpt,author(name)&search=MongoREST&searchFields=title,content,excerpt&status=eq.published

# Advanced search với multiple filters
GET /crud/posts?select=title,slug,excerpt,categories(name)&search=javascript&categories.name=in.(Technology,Programming)&publishedAt=gte.2024-01-01
```

### CMS Admin Functions

#### Bulk Post Operations
```json
{
  "name": "bulkPublishPosts",
  "description": "Publish multiple posts at once",
  "method": "POST",
  "permissions": ["admin", "editor"],
  "steps": [
    {
      "id": "validatePosts",
      "type": "find",
      "collection": "posts",
      "query": {
        "_id": { "$in": "{{params.postIds}}" },
        "status": "draft"
      }
    },
    {
      "id": "publishPosts",
      "type": "updateMany", 
      "collection": "posts",
      "filter": { "_id": { "$in": "{{params.postIds}}" } },
      "update": {
        "$set": {
          "status": "published",
          "publishedAt": "{{now}}"
        }
      }
    },
    {
      "id": "updateSearchIndex",
      "type": "http",
      "url": "{{config.searchService}}/reindex",
      "method": "POST",
      "body": { "postIds": "{{params.postIds}}" }
    }
  ]
}
```

---

## 📊 Analytics Dashboard

### Schema Design cho Analytics

#### Analytics Events Collection
```json
{
  "title": "Analytics Events",
  "collection": "analytics_events",
  "properties": {
    "_id": { "type": "string" },
    "event": { "type": "string", "enum": ["pageview", "click", "purchase", "signup"] },
    "userId": { "type": "string" },
    "sessionId": { "type": "string" },
    "properties": { "type": "object" },
    "timestamp": { "type": "string", "format": "date-time" }
  },
  "relationships": {
    "user": {
      "type": "belongsTo",
      "collection": "users",
      "localField": "userId", 
      "foreignField": "_id"
    }
  },
  "indexes": [
    { "fields": { "event": 1, "timestamp": -1 } },
    { "fields": { "userId": 1, "timestamp": -1 } },
    { "fields": { "timestamp": -1 } }
  ]
}
```

### Analytics Queries

#### 1. Real-time Dashboard Metrics
```bash
# Today's key metrics
GET /crud/analytics_events?select=event,timestamp&timestamp=gte.2025-01-15T00:00:00Z

# User activity by hour
GET /functions/analytics/hourlyActivity
POST /functions/analytics/userEngagement
{
  "dateRange": {
    "start": "2025-01-01",
    "end": "2025-01-31"
  }
}
```

#### 2. User Behavior Analysis
```bash
# User journey analysis
GET /crud/analytics_events?select=event,properties,timestamp,user(name,country)&userId=eq.60f7b3b3b3b3b3b3b3b3b3b3&sort=timestamp&order=asc

# Geographic distribution
GET /crud/users?select=country,createdAt&sort=createdAt&order=desc
```

### Analytics Functions

#### Advanced Analytics Function
```json
{
  "name": "generateDashboardReport",
  "description": "Generate comprehensive dashboard analytics",
  "method": "POST",
  "steps": [
    {
      "id": "dailyStats",
      "type": "aggregate",
      "collection": "analytics_events", 
      "pipeline": [
        { "$match": { "timestamp": { "$gte": "{{params.startDate}}" } } },
        { "$group": {
          "_id": {
            "date": { "$dateToString": { "format": "%Y-%m-%d", "date": "$timestamp" } },
            "event": "$event"
          },
          "count": { "$sum": 1 }
        }},
        { "$group": {
          "_id": "$_id.date",
          "events": {
            "$push": { "event": "$_id.event", "count": "$count" }
          }
        }}
      ]
    },
    {
      "id": "topPages",
      "type": "aggregate",
      "collection": "analytics_events",
      "pipeline": [
        { "$match": { "event": "pageview" } },
        { "$group": {
          "_id": "$properties.page",
          "views": { "$sum": 1 },
          "uniqueUsers": { "$addToSet": "$userId" }
        }},
        { "$addFields": { "uniqueUsers": { "$size": "$uniqueUsers" } } },
        { "$sort": { "views": -1 } },
        { "$limit": 20 }
      ]
    }
  ]
}
```

---

## 📱 Social Media App

### Schema Design

#### Users với Social Features
```json
{
  "title": "Social Users",
  "collection": "users",
  "properties": {
    "_id": { "type": "string" },
    "username": { "type": "string", "pattern": "^[a-zA-Z0-9_]{3,20}$" },
    "email": { "type": "string", "format": "email" },
    "profile": {
      "type": "object",
      "properties": {
        "displayName": { "type": "string" },
        "bio": { "type": "string", "maxLength": 500 },
        "avatar": { "type": "string", "format": "uri" },
        "followersCount": { "type": "integer", "minimum": 0 },
        "followingCount": { "type": "integer", "minimum": 0 }
      }
    }
  },
  "relationships": {
    "posts": {
      "type": "hasMany",
      "collection": "posts",
      "localField": "_id",
      "foreignField": "authorId",
      "defaultSort": { "createdAt": -1 }
    },
    "followers": {
      "type": "manyToMany", 
      "collection": "users",
      "through": "user_follows",
      "localField": "_id",
      "throughLocalField": "followingId",
      "throughForeignField": "followerId", 
      "foreignField": "_id"
    },
    "following": {
      "type": "manyToMany",
      "collection": "users", 
      "through": "user_follows",
      "localField": "_id",
      "throughLocalField": "followerId",
      "throughForeignField": "followingId",
      "foreignField": "_id"
    }
  }
}
```

### Social Media Use Cases

#### 1. User Profile với Stats
```bash
# Complete user profile
GET /crud/users/60f7b3b3b3b3b3b3b3b3b3b3?select=username,profile(*),posts(content,createdAt,likesCount:likes!count)!limit.10,followersCount:followers!count,followingCount:following!count

# Response bao gồm user info + recent posts + social stats
```

#### 2. Social Feed
```bash
# Timeline feed (posts from following users)
GET /crud/posts?select=content,createdAt,author(username,profile.avatar),likesCount:likes!count,commentsCount:comments!count&author._id=in.({{followingUserIds}})&sort=createdAt&order=desc

# Discover feed (trending posts)
GET /crud/posts?select=content,author(username,profile.avatar),likesCount:likes!count&createdAt=gte.2025-01-15&sort=likesCount&order=desc&limit=20
```

#### 3. Social Interactions
```bash
# User's activity
GET /crud/likes?select=post(content,author(username)),createdAt&userId=eq.60f7b3b3b3b3b3b3b3b3b3b3&sort=createdAt&order=desc

# Notifications
GET /crud/notifications?select=type,content,from(username,profile.avatar),createdAt&userId=eq.60f7b3b3b3b3b3b3b3b3b3b3&read=eq.false
```

### Social Functions

#### Follow/Unfollow Function
```json
{
  "name": "toggleFollow",
  "description": "Follow or unfollow a user", 
  "method": "POST",
  "steps": [
    {
      "id": "checkExisting",
      "type": "findOne",
      "collection": "user_follows",
      "query": {
        "followerId": "{{user.id}}",
        "followingId": "{{params.targetUserId}}"
      }
    },
    {
      "id": "toggleFollow",
      "type": "condition",
      "if": "{{steps.checkExisting.output}}",
      "then": [
        {
          "type": "deleteOne",
          "collection": "user_follows", 
          "filter": {
            "followerId": "{{user.id}}",
            "followingId": "{{params.targetUserId}}"
          }
        }
      ],
      "else": [
        {
          "type": "insertOne",
          "collection": "user_follows",
          "document": {
            "followerId": "{{user.id}}",
            "followingId": "{{params.targetUserId}}",
            "createdAt": "{{now}}"
          }
        }
      ]
    },
    {
      "id": "updateCounts",
      "type": "updateMany",
      "collection": "users",
      "operations": [
        {
          "filter": { "_id": "{{user.id}}" },
          "update": { "$inc": { "profile.followingCount": "{{followingIncrement}}" } }
        },
        {
          "filter": { "_id": "{{params.targetUserId}}" },
          "update": { "$inc": { "profile.followersCount": "{{followersIncrement}}" } }
        }
      ]
    }
  ]
}
```

---

## 🏢 Enterprise Resource Planning

### Schema Design cho ERP

#### Employees Collection
```json
{
  "title": "Employees",
  "collection": "employees",
  "properties": {
    "_id": { "type": "string" },
    "employeeId": { "type": "string", "pattern": "^EMP[0-9]{4}$" },
    "personalInfo": {
      "type": "object",
      "properties": {
        "firstName": { "type": "string" },
        "lastName": { "type": "string" },
        "email": { "type": "string", "format": "email" },
        "phone": { "type": "string" }
      }
    },
    "jobInfo": {
      "type": "object", 
      "properties": {
        "title": { "type": "string" },
        "departmentId": { "type": "string" },
        "managerId": { "type": "string" },
        "salary": { "type": "number", "minimum": 0 },
        "startDate": { "type": "string", "format": "date" }
      }
    }
  },
  "relationships": {
    "department": {
      "type": "belongsTo",
      "collection": "departments",
      "localField": "jobInfo.departmentId", 
      "foreignField": "_id"
    },
    "manager": {
      "type": "belongsTo",
      "collection": "employees",
      "localField": "jobInfo.managerId",
      "foreignField": "_id"
    },
    "subordinates": {
      "type": "hasMany",
      "collection": "employees", 
      "localField": "_id",
      "foreignField": "jobInfo.managerId"
    }
  }
}
```

### ERP Use Cases

#### 1. Organization Chart
```bash
# Department với managers và employees
GET /crud/departments?select=name,manager(personalInfo.firstName,personalInfo.lastName,jobInfo.title),employees(personalInfo.firstName,personalInfo.lastName,jobInfo.title)

# Employee hierarchy
GET /crud/employees/60f7b3b3b3b3b3b3b3b3b3b3?select=personalInfo(*),jobInfo(*),manager(personalInfo.firstName,personalInfo.lastName),subordinates(personalInfo.firstName,personalInfo.lastName,jobInfo.title)
```

#### 2. HR Analytics
```bash
# Salary analytics by department
GET /crud/departments?select=name,avgSalary:employees!avg(jobInfo.salary),employeeCount:employees!count

# Employee distribution 
GET /crud/employees?select=jobInfo.title,department(name)&sort=jobInfo.salary&order=desc
```

### ERP Functions

#### Payroll Calculation Function
```json
{
  "name": "calculatePayroll",
  "description": "Calculate monthly payroll for department",
  "method": "POST",
  "permissions": ["admin", "hr"],
  "steps": [
    {
      "id": "getEmployees",
      "type": "find",
      "collection": "employees",
      "query": {
        "jobInfo.departmentId": "{{params.departmentId}}",
        "status": "active"
      }
    },
    {
      "id": "getAttendance",
      "type": "aggregate",
      "collection": "attendance",
      "pipeline": [
        { "$match": { 
          "employeeId": { "$in": "{{steps.getEmployees.output.map(e => e._id)}}" },
          "date": { "$gte": "{{params.payrollMonth}}-01" }
        }},
        { "$group": {
          "_id": "$employeeId",
          "workedDays": { "$sum": 1 },
          "overtimeHours": { "$sum": "$overtimeHours" }
        }}
      ]
    },
    {
      "id": "calculateSalaries", 
      "type": "transform",
      "script": "calculateMonthlySalaries",
      "input": {
        "employees": "{{steps.getEmployees.output}}",
        "attendance": "{{steps.getAttendance.output}}"
      }
    }
  ]
}
```

---

## 💡 Best Practices

### 1. Schema Design Best Practices

#### Relationship Design
```json
// ✅ Good: Clear relationship definitions
"relationships": {
  "author": {
    "type": "belongsTo",
    "collection": "users",
    "localField": "authorId",
    "foreignField": "_id",
    "description": "Post author",
    "validation": { "required": true }
  }
}

// ❌ Avoid: Unclear relationships
"relationships": {
  "user": {
    "type": "belongsTo", 
    "collection": "users"
  }
}
```

#### Index Strategy
```json
// ✅ Good: Strategic indexing
"indexes": [
  { "fields": { "authorId": 1 }, "background": true },
  { "fields": { "status": 1, "publishedAt": -1 } },
  { "fields": { "title": "text", "content": "text" } }
]
```

### 2. Query Optimization

#### Efficient Relationship Queries
```bash
# ✅ Good: Specific field selection
GET /crud/posts?select=title,author(name,avatar),commentCount:comments!count

# ❌ Avoid: Over-fetching
GET /crud/posts?select=*,author(*),comments(*)
```

#### Smart Filtering
```bash
# ✅ Good: Use indexes
GET /crud/posts?status=eq.published&publishedAt=gte.2025-01-01

# ✅ Good: Relationship filtering
GET /crud/posts?select=title,author(name)&author.status=eq.active
```

### 3. Security Best Practices

#### Permission Configuration
```json
{
  "mongorest": {
    "permissions": {
      "read": ["user", "admin"],
      "create": ["admin"],
      "update": ["admin"], 
      "delete": ["admin"]
    },
    "rateLimits": {
      "read": { "requests": 100, "window": "1h" },
      "write": { "requests": 20, "window": "1h" }
    }
  }
}
```

#### Input Validation
```json
{
  "properties": {
    "email": { 
      "type": "string", 
      "format": "email",
      "maxLength": 100
    },
    "age": {
      "type": "integer",
      "minimum": 0,
      "maximum": 150
    }
  },
  "required": ["email", "name"],
  "additionalProperties": false
}
```

### 4. Performance Optimization

#### Smart Pagination
```bash
# ✅ Good: Reasonable limits
GET /crud/posts?limit=20&page=1

# ✅ Good: Cursor-based for large datasets  
GET /crud/posts?limit=20&after=60f7b3b3b3b3b3b3b3b3b3b3
```

#### Efficient Aggregations
```bash
# ✅ Good: Limited nested data
GET /crud/users?select=name,recentPosts:posts(title,createdAt)!limit.5

# ❌ Avoid: Unlimited nested data
GET /crud/users?select=name,posts(*)
```

### 5. Error Handling

#### Graceful Error Responses
```json
{
  "success": false,
  "error": "Validation Error",
  "message": "Invalid input data",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format",
      "value": "invalid-email"
    }
  ],
  "code": "VALIDATION_ERROR",
  "timestamp": "2025-01-15T10:00:00Z"
}
```

### 6. Monitoring và Analytics

#### Key Metrics để Track
- Request response times
- Error rates by endpoint
- Most used relationships
- Cache hit rates
- Database query performance
- Authentication failure rates

#### Performance Monitoring
```javascript
// Monitor slow queries
if (executionTime > 1000) {
  logger.warn('Slow query detected', {
    collection,
    operation,
    executionTime,
    pipeline: query
  });
}
```

---

## 📋 Checklist cho Production

### Pre-deployment
- [ ] Schema validation hoàn tất
- [ ] Relationships tested thoroughly
- [ ] Indexes được tạo đầy đủ
- [ ] Authentication & authorization configured
- [ ] Rate limiting setup
- [ ] Error handling implemented
- [ ] Monitoring và logging setup
- [ ] Performance testing completed
- [ ] Security audit passed
- [ ] Documentation updated

### Post-deployment
- [ ] Monitor performance metrics
- [ ] Track error rates
- [ ] Monitor resource usage
- [ ] Check authentication logs
- [ ] Validate backup procedures
- [ ] Test disaster recovery
- [ ] User feedback collection
- [ ] Performance optimization ongoing

---

*Document này cung cấp practical examples và best practices cho việc sử dụng MongoREST trong các scenario thực tế. Để hiểu sâu hơn về technical implementation, tham khảo MongoREST-Technical.md*
