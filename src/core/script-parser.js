import { ObjectId } from 'mongodb';

class MongoScriptParser {
  constructor() {
    this.operators = new Set([
      '$and', '$or', '$not', '$nor',
      '$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin',
      '$exists', '$type', '$regex', '$expr', '$where',
      '$elemMatch', '$size', '$all',
      '$set', '$unset', '$inc', '$push', '$pull', '$addToSet',
      '$match', '$group', '$project', '$sort', '$limit', '$skip',
      '$lookup', '$unwind', '$addFields', '$facet', '$count'
    ]);
  }

  // Parse MongoDB shell command and convert to API call format
  parseScript(script) {
    try {
      // Remove comments and whitespace
      const cleanScript = this.cleanScript(script);
      
      // Extract method chain
      const chainMatch = cleanScript.match(/db\.(\w+)\.(\w+)\(([\s\S]*)\)(?:\.(\w+)\(([\s\S]*?)\))*(?:\.(\w+)\(([\s\S]*?)\))*/);
      
      if (!chainMatch) {
        throw new Error('Invalid MongoDB script format');
      }
      
      const [fullMatch, collection, operation, mainParams, ...chainMethods] = chainMatch;
      
      // Parse main parameters
      const params = this.parseNestedParameters(operation, mainParams);
      
      // Parse chained methods (sort, limit, skip, etc.)
      const chainedOps = this.parseChainedMethods(cleanScript);
      
      return {
        collection,
        operation,
        params: { ...params, ...chainedOps }
      };
      
    } catch (error) {
      throw new Error(`Script parsing failed: ${error.message}`);
    }
  }

  cleanScript(script) {
    return script
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
      .replace(/\/\/.*$/gm, '')          // Remove line comments
      .replace(/\s+/g, ' ')              // Normalize whitespace
      .trim();
  }

  parseNestedParameters(operation, paramsStr) {
    if (!paramsStr.trim()) return {};
    
    try {
      // Handle nested objects and arrays
      const processedParams = this.processNestedStructures(paramsStr);
      const parsed = this.safeJsonParse(processedParams);
      
      return this.formatParametersByOperation(operation, parsed);
    } catch (error) {
      console.warn('Fallback to simple parsing:', error.message);
      return this.simpleParse(paramsStr);
    }
  }

  processNestedStructures(str) {
    return str
      // Handle ObjectId
      .replace(/ObjectId\("([^"]+)"\)/g, '"$1"')
      // Handle Date objects
      .replace(/new Date\("([^"]+)"\)/g, '"$1"')
      .replace(/new Date\(\)/g, `"${new Date().toISOString()}"`)
      // Handle RegExp
      .replace(/\/([^\/]+)\/([gimuy]*)/g, '{"$regex": "$1", "$options": "$2"}')
      // Handle unquoted keys
      .replace(/(\w+):/g, '"$1":')
      // Handle single quotes
      .replace(/'/g, '"')
      // Handle trailing commas
      .replace(/,(\s*[}\]])/g, '$1');
  }

  safeJsonParse(str) {
    // Try direct parsing first
    try {
      return JSON.parse(str);
    } catch (e) {
      // Try wrapping in object
      try {
        return JSON.parse(`{${str}}`);
      } catch (e2) {
        // Try as array
        try {
          return JSON.parse(`[${str}]`);
        } catch (e3) {
          throw new Error('Cannot parse as valid JSON');
        }
      }
    }
  }

  parseChainedMethods(script) {
    const chainedOps = {};
    
    // Extract sort
    const sortMatch = script.match(/\.sort\(([^)]+)\)/);
    if (sortMatch) {
      chainedOps.sort = this.safeJsonParse(this.processNestedStructures(sortMatch[1]));
    }
    
    // Extract limit
    const limitMatch = script.match(/\.limit\((\d+)\)/);
    if (limitMatch) {
      chainedOps.limit = parseInt(limitMatch[1]);
    }
    
    // Extract skip
    const skipMatch = script.match(/\.skip\((\d+)\)/);
    if (skipMatch) {
      chainedOps.skip = parseInt(skipMatch[1]);
    }
    
    return chainedOps;
  }

  formatParametersByOperation(operation, parsed) {
    switch (operation) {
      case 'find':
        if (Array.isArray(parsed)) {
          return {
            query: parsed[0] || {},
            projection: parsed[1] || {}
          };
        }
        return { query: parsed };
        
      case 'aggregate':
        return {
          pipeline: Array.isArray(parsed) ? parsed : [parsed]
        };
        
      case 'bulkWrite':
        return {
          operations: Array.isArray(parsed) ? parsed : [parsed]
        };
        
      case 'insertMany':
        return {
          documents: Array.isArray(parsed) ? parsed : [parsed]
        };

      case 'insertOne':
        return {
          document: parsed
        };

      case 'updateOne':
      case 'updateMany':
        if (Array.isArray(parsed) && parsed.length >= 2) {
          return {
            filter: parsed[0] || {},
            update: parsed[1] || {}
          };
        }
        return parsed;

      case 'deleteOne':
      case 'deleteMany':
        return {
          filter: parsed
        };

      case 'replaceOne':
        if (Array.isArray(parsed) && parsed.length >= 2) {
          return {
            filter: parsed[0] || {},
            replacement: parsed[1] || {}
          };
        }
        return parsed;

      case 'countDocuments':
      case 'distinct':
        return {
          query: parsed
        };
        
      default:
        return parsed;
    }
  }

  simpleParse(str) {
    // Fallback simple parsing
    return { query: {} };
  }

  // Convert API parameters back to MongoDB script (for logging/debugging)
  parametersToScript(collection, operation, params) {
    let script = `db.${collection}.${operation}(`;
    
    switch (operation) {
      case 'find':
        const query = JSON.stringify(params.query || {});
        const projection = params.projection ? `, ${JSON.stringify(params.projection)}` : '';
        script += query + projection;
        break;
        
      case 'insertOne':
        script += JSON.stringify(params.document || {});
        break;
        
      case 'insertMany':
        script += JSON.stringify(params.documents || []);
        break;
        
      case 'updateOne':
      case 'updateMany':
        script += `${JSON.stringify(params.filter || {})}, ${JSON.stringify(params.update || {})}`;
        break;
        
      case 'deleteOne':
      case 'deleteMany':
        script += JSON.stringify(params.filter || {});
        break;
        
      case 'aggregate':
        script += JSON.stringify(params.pipeline || []);
        break;
        
      default:
        script += JSON.stringify(params);
    }
    
    script += ')';
    
    // Add chained methods
    if (params.sort) {
      script += `.sort(${JSON.stringify(params.sort)})`;
    }
    if (params.limit) {
      script += `.limit(${params.limit})`;
    }
    if (params.skip) {
      script += `.skip(${params.skip})`;
    }
    
    return script;
  }

  // Validate if script is safe to execute
  validateScript(script) {
    const dangerousOperators = ['$where', '$eval', '$function'];
    const dangerousKeywords = ['eval', 'Function', 'require', 'process', 'global'];
    
    // Check for dangerous operators
    for (const op of dangerousOperators) {
      if (script.includes(op)) {
        throw new Error(`Dangerous operator '${op}' is not allowed`);
      }
    }
    
    // Check for dangerous keywords
    for (const keyword of dangerousKeywords) {
      if (script.includes(keyword)) {
        throw new Error(`Dangerous keyword '${keyword}' is not allowed`);
      }
    }
    
    return true;
  }

  // Extract collections referenced in script
  extractCollections(script) {
    const collections = new Set();
    const regex = /db\.(\w+)\./g;
    let match;
    
    while ((match = regex.exec(script)) !== null) {
      collections.add(match[1]);
    }
    
    return Array.from(collections);
  }

  // Estimate execution complexity
  estimateComplexity(script) {
    const complexOperators = ['$lookup', '$facet', '$group', '$unwind'];
    const aggregationPipelines = (script.match(/\$\w+/g) || []).length;
    const nestedQueries = (script.match(/\{[^}]*\{/g) || []).length;
    
    let complexity = 1;
    
    // Add complexity for aggregation operators
    for (const op of complexOperators) {
      if (script.includes(op)) {
        complexity += 2;
      }
    }
    
    // Add complexity for pipeline length
    complexity += Math.floor(aggregationPipelines / 3);
    
    // Add complexity for nested structures
    complexity += nestedQueries;
    
    return Math.min(complexity, 10); // Cap at 10
  }

  // Convert ObjectId strings to ObjectId instances for MongoDB
  convertObjectIds(obj) {
    if (typeof obj === 'string' && ObjectId.isValid(obj)) {
      return new ObjectId(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.convertObjectIds(item));
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const converted = {};
      for (const [key, value] of Object.entries(obj)) {
        if (key === '_id' && typeof value === 'string' && ObjectId.isValid(value)) {
          converted[key] = new ObjectId(value);
        } else {
          converted[key] = this.convertObjectIds(value);
        }
      }
      return converted;
    }
    
    return obj;
  }

  // Parse and prepare parameters for MongoDB execution
  parseAndPrepare(script) {
    // Validate script safety
    this.validateScript(script);
    
    // Parse script to parameters
    const parsed = this.parseScript(script);
    
    // Convert ObjectIds
    parsed.params = this.convertObjectIds(parsed.params);
    
    // Add metadata
    parsed.meta = {
      originalScript: script,
      complexity: this.estimateComplexity(script),
      collections: this.extractCollections(script),
      parsedAt: new Date().toISOString()
    };
    
    return parsed;
  }
}

export default MongoScriptParser;
