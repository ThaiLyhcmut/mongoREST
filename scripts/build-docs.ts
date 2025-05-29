import { promises as fs } from 'fs';
import path from 'path';
import {
  DocumentationConfig,
  CollectionDocumentation,
  FunctionDocumentation,
  EndpointDocumentation,
  OpenAPISpec,
  CollectionSchema,
  FunctionDefinition
} from './types.js';

export async function buildDocs(): Promise<void> {
  console.log('📚 Building MongoREST documentation...\
');

  const schemasPath = path.join(process.cwd(), 'schemas');
  const docsPath = path.join(process.cwd(), 'docs');
  
  // Ensure docs directory exists
  try {
    await fs.mkdir(docsPath, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }

  const documentation: DocumentationConfig = {
    service: 'MongoREST',
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    collections: [],
    functions: [],
    endpoints: []
  };

  // Load collection schemas
  console.log('📄 Processing collection schemas...');
  try {
    const collectionsPath = path.join(schemasPath, 'collections');
    const collectionFiles = await fs.readdir(collectionsPath);
    
    for (const file of collectionFiles) {
      if (!file.endsWith('.json')) continue;
      
      const filePath = path.join(collectionsPath, file);
      const content = await fs.readFile(filePath, 'utf8');
      const schema: CollectionSchema = JSON.parse(content);
      
      const collectionName = schema.collection || path.basename(file, '.json');
      
      const collectionDoc: CollectionDocumentation = {
        name: collectionName,
        title: schema.title,
        description: schema.description || '',
        properties: Object.keys(schema.properties || {}),
        required: schema.required || [],
        indexes: schema.indexes || [],
        permissions: schema.mongorest?.permissions || {},
        rateLimits: schema.mongorest?.rateLimits || {},
        endpoints: generateCRUDEndpoints(collectionName)
      };
      
      documentation.collections.push(collectionDoc);
      documentation.endpoints.push(...collectionDoc.endpoints);
      
      console.log(`  ✅ ${collectionName}`);
    }
  } catch (error) {
    console.log(`  ⚠️  Collections directory not found`);
  }

  // Load function schemas
  console.log('\
🔧 Processing function schemas...');
  try {
    const functionsPath = path.join(schemasPath, 'functions');
    await processFunctionsRecursively(functionsPath, documentation);
  } catch (error) {
    console.log(`  ⚠️  Functions directory not found`);
  }

  // Generate OpenAPI specification
  console.log('\
🔨 Generating OpenAPI specification...');
  const openApiSpec = generateOpenAPISpec(documentation);
  
  // Write documentation files
  await fs.writeFile(
    path.join(docsPath, 'api-catalog.json'),
    JSON.stringify(documentation, null, 2)
  );
  
  await fs.writeFile(
    path.join(docsPath, 'openapi.json'),
    JSON.stringify(openApiSpec, null, 2)
  );

  // Generate HTML documentation
  const htmlDoc = generateHTMLDocs(documentation);
  await fs.writeFile(
    path.join(docsPath, 'index.html'),
    htmlDoc
  );

  // Generate endpoint summary
  const endpointSummary = generateEndpointSummary(documentation);
  await fs.writeFile(
    path.join(docsPath, 'endpoints.md'),
    endpointSummary
  );

  console.log('\
📊 Documentation Summary:');
  console.log(`  Collections: ${documentation.collections.length}`);
  console.log(`  Functions: ${documentation.functions.length}`);
  console.log(`  Total Endpoints: ${documentation.endpoints.length}`);
  console.log(`\
✅ Documentation built successfully!`);
  console.log(`  📁 Output directory: ${docsPath}`);
  console.log(`  🌐 HTML docs: ${path.join(docsPath, 'index.html')}`);
}

async function processFunctionsRecursively(dir: string, documentation: DocumentationConfig): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        await processFunctionsRecursively(fullPath, documentation);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        try {
          const content = await fs.readFile(fullPath, 'utf8');
          const functionDef: FunctionDefinition = JSON.parse(content);
          
          const functionDoc: FunctionDocumentation = {
            name: functionDef.name,
            description: functionDef.description,
            category: functionDef.category || 'general',
            method: functionDef.method || 'POST',
            endpoint: functionDef.endpoint || `/functions/${functionDef.name}`,
            permissions: functionDef.permissions || [],
            rateLimits: functionDef.rateLimits || {},
            steps: functionDef.steps.length,
            stepTypes: [...new Set(functionDef.steps.map(s => s.type))],
            collections: [...new Set(functionDef.steps
              .filter(s => s.collection)
              .map(s => s.collection!))],
            input: functionDef.input || null,
            output: functionDef.output || null,
            timeout: functionDef.timeout || 30000,
            caching: functionDef.caching || null
          };
          
          documentation.functions.push(functionDoc);
          documentation.endpoints.push({
            method: functionDoc.method,
            path: functionDoc.endpoint,
            type: 'function',
            description: functionDoc.description,
            permissions: functionDoc.permissions
          });
          
          console.log(`  ✅ ${functionDef.name} (${functionDef.category || 'general'})`);
        } catch (error: any) {
          console.log(`  ❌ ${entry.name} - ${error.message}`);
        }
      }
    }
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

function generateCRUDEndpoints(collectionName: string): EndpointDocumentation[] {
  const baseUrl = `/crud/${collectionName}`;
  
  return [
    {
      method: 'GET',
      path: baseUrl,
      type: 'crud',
      operation: 'list',
      description: `List ${collectionName} documents`
    },
    {
      method: 'GET', 
      path: `${baseUrl}/:id`,
      type: 'crud',
      operation: 'get',
      description: `Get single ${collectionName} document`
    },
    {
      method: 'POST',
      path: baseUrl,
      type: 'crud', 
      operation: 'create',
      description: `Create new ${collectionName} document`
    },
    {
      method: 'PUT',
      path: `${baseUrl}/:id`,
      type: 'crud',
      operation: 'replace', 
      description: `Replace ${collectionName} document`
    },
    {
      method: 'PATCH',
      path: `${baseUrl}/:id`,
      type: 'crud',
      operation: 'update',
      description: `Update ${collectionName} document`
    },
    {
      method: 'DELETE',
      path: `${baseUrl}/:id`, 
      type: 'crud',
      operation: 'delete',
      description: `Delete ${collectionName} document`
    }
  ];
}

function generateOpenAPISpec(documentation: DocumentationConfig): OpenAPISpec {
  const spec: OpenAPISpec = {
    openapi: '3.0.3',
    info: {
      title: 'MongoREST API',
      description: 'Auto-generated REST API for MongoDB collections and custom functions',
      version: '1.0.0',
      contact: {
        name: 'MongoREST API',
        url: 'https://github.com/mongorest/mongorest'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ],
    paths: {}
  };

  // Generate paths for collections
  documentation.collections.forEach(collection => {
    collection.endpoints.forEach(endpoint => {
      if (!spec.paths[endpoint.path]) {
        spec.paths[endpoint.path] = {};
      }
      
      spec.paths[endpoint.path][endpoint.method.toLowerCase()] = {
        summary: endpoint.description,
        tags: [collection.name],
        responses: {
          '200': {
            description: 'Success'
          },
          '400': {
            description: 'Bad Request'
          },
          '401': {
            description: 'Unauthorized'
          },
          '403': {
            description: 'Forbidden'
          },
          '404': {
            description: 'Not Found'
          }
        }
      };
    });
  });

  // Generate paths for functions
  documentation.functions.forEach(func => {
    if (!spec.paths[func.endpoint]) {
      spec.paths[func.endpoint] = {};
    }
    
    spec.paths[func.endpoint][func.method.toLowerCase()] = {
      summary: func.description,
      tags: ['Functions', func.category],
      requestBody: func.input ? {
        content: {
          'application/json': {
            schema: func.input
          }
        }
      } : undefined,
      responses: {
        '200': {
          description: 'Function executed successfully',
          content: func.output ? {
            'application/json': {
              schema: func.output
            }
          } : undefined
        }
      }
    };
  });

  return spec;
}

function generateHTMLDocs(documentation: DocumentationConfig): string {
  return `<!DOCTYPE html>
<html lang=\"en\">
<head>
    <meta charset=\"UTF-8\">
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
    <title>MongoREST API Documentation</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; margin: 0; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 40px; }
        .section { margin-bottom: 40px; }
        .card { border: 1px solid #ddd; padding: 20px; margin-bottom: 20px; border-radius: 8px; }
        .method { padding: 4px 8px; border-radius: 4px; color: white; font-weight: bold; font-size: 12px; }
        .get { background-color: #61affe; }
        .post { background-color: #49cc90; }
        .put { background-color: #fca130; }
        .patch { background-color: #50e3c2; }
        .delete { background-color: #f93e3e; }
        .endpoint { font-family: monospace; background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f5f5f5; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 40px; }
        .stat-card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
        .stat-number { font-size: 2em; font-weight: bold; color: #007bff; }
    </style>
</head>
<body>
    <div class=\"container\">
        <div class=\"header\">
            <h1>MongoREST API Documentation</h1>
            <p>Auto-generated REST API for MongoDB collections and custom functions</p>
            <p><em>Generated on ${new Date(documentation.generatedAt).toLocaleString()}</em></p>
        </div>

        <div class=\"stats\">
            <div class=\"stat-card\">
                <div class=\"stat-number\">${documentation.collections.length}</div>
                <div>Collections</div>
            </div>
            <div class=\"stat-card\">
                <div class=\"stat-number\">${documentation.functions.length}</div>
                <div>Functions</div>
            </div>
            <div class=\"stat-card\">
                <div class=\"stat-number\">${documentation.endpoints.length}</div>
                <div>Total Endpoints</div>
            </div>
        </div>

        <div class=\"section\">
            <h2>Collections</h2>
            ${documentation.collections.map(collection => `
                <div class=\"card\">
                    <h3>${collection.title}</h3>
                    <p>${collection.description}</p>
                    
                    <h4>Endpoints</h4>
                    ${collection.endpoints.map(endpoint => `
                        <div style=\"margin-bottom: 10px;\">
                            <span class=\"method ${endpoint.method.toLowerCase()}\">${endpoint.method}</span>
                            <span class=\"endpoint\">${endpoint.path}</span>
                            <span>${endpoint.description}</span>
                        </div>
                    `).join('')}
                    
                    <h4>Schema Properties</h4>
                    <p><strong>Properties:</strong> ${collection.properties.join(', ')}</p>
                    <p><strong>Required:</strong> ${collection.required.join(', ') || 'None'}</p>
                    
                    ${collection.indexes.length > 0 ? `
                        <h4>Indexes</h4>
                        <ul>
                            ${collection.indexes.map(index => `
                                <li>${JSON.stringify(index.fields)} ${index.unique ? '(unique)' : ''}</li>
                            `).join('')}
                        </ul>
                    ` : ''}
                </div>
            `).join('')}
        </div>

        <div class=\"section\">
            <h2>Custom Functions</h2>
            ${documentation.functions.map(func => `
                <div class=\"card\">
                    <h3>${func.name}</h3>
                    <p>${func.description}</p>
                    
                    <div style=\"margin-bottom: 10px;\">
                        <span class=\"method ${func.method.toLowerCase()}\">${func.method}</span>
                        <span class=\"endpoint\">${func.endpoint}</span>
                    </div>
                    
                    <p><strong>Category:</strong> ${func.category}</p>
                    <p><strong>Steps:</strong> ${func.steps} (${func.stepTypes.join(', ')})</p>
                    <p><strong>Collections Used:</strong> ${func.collections.join(', ') || 'None'}</p>
                    <p><strong>Permissions:</strong> ${func.permissions.join(', ') || 'None'}</p>
                    <p><strong>Timeout:</strong> ${func.timeout}ms</p>
                </div>
            `).join('')}
        </div>

        <div class=\"section\">
            <h2>All Endpoints</h2>
            <table>
                <thead>
                    <tr>
                        <th>Method</th>
                        <th>Path</th>
                        <th>Type</th>
                        <th>Description</th>
                    </tr>
                </thead>
                <tbody>
                    ${documentation.endpoints.map(endpoint => `
                        <tr>
                            <td><span class=\"method ${endpoint.method.toLowerCase()}\">${endpoint.method}</span></td>
                            <td><code>${endpoint.path}</code></td>
                            <td>${endpoint.type}</td>
                            <td>${endpoint.description}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>`;
}

function generateEndpointSummary(documentation: DocumentationConfig): string {
  let markdown = `# MongoREST API Endpoints\
\
`;
  markdown += `Generated on ${new Date(documentation.generatedAt).toISOString()}\
\
`;

  // Summary
  markdown += `## Summary\
\
`;
  markdown += `- **Collections**: ${documentation.collections.length}\
`;
  markdown += `- **Functions**: ${documentation.functions.length}\
`;
  markdown += `- **Total Endpoints**: ${documentation.endpoints.length}\
\
`;

  // Collections
  markdown += `## Collections\
\
`;
  documentation.collections.forEach(collection => {
    markdown += `### ${collection.title}\
\
`;
    markdown += `${collection.description}\
\
`;
    
    markdown += `| Method | Endpoint | Description |\
`;
    markdown += `|--------|----------|-------------|\
`;
    collection.endpoints.forEach(endpoint => {
      markdown += `| ${endpoint.method} | \`\${endpoint.path}\`\ | ${endpoint.description} |\
`;
    });
    markdown += `\
`;
  });

  // Functions
  markdown += `## Functions\
\
`;
  documentation.functions.forEach(func => {
    markdown += `### ${func.name}\
\
`;
    markdown += `${func.description}\
\
`;
    markdown += `- **Method**: ${func.method}\
`;
    markdown += `- **Endpoint**: \`${func.endpoint}\`\
`;
    markdown += `- **Category**: ${func.category}\
`;
    markdown += `- **Steps**: ${func.steps}\
`;
    markdown += `- **Permissions**: ${func.permissions.join(', ') || 'None'}\
\
`;
  });

  return markdown;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  buildDocs().catch(error => {
    console.error('Documentation build failed:', error);
    process.exit(1);
  });
}