/**
 * RelationshipFilterParser - Handle filtering on relationships
 * Supports PostgREST-style operators: eq, neq, gt, gte, lt, lte, in, nin, like, ilike
 */
class RelationshipFilterParser {
  constructor(schemaLoader) {
    this.schemas = schemaLoader.schemas;
  }

  /**
   * Parse filter parameters including relationship filters
   * @param {string} collection - Collection name
   * @param {Object} filterParams - Query parameters
   * @returns {Object} Parsed filters
   */
  parseFilters(collection, filterParams) {
    const filters = {};
    const relationshipFilters = {};
    const specialFilters = {};

    for (const [key, value] of Object.entries(filterParams)) {
      // Skip non-filter parameters
      if (['select', 'sort', 'order', 'page', 'limit', 'offset'].includes(key)) {
        continue;
      }

      if (key.includes('.')) {
        // Relationship filter: "category.name=eq.Tech"
        const [relationPath, ...fieldParts] = key.split('.');
        const field = fieldParts.join('.');

        if (!relationshipFilters[relationPath]) {
          relationshipFilters[relationPath] = {};
        }
        relationshipFilters[relationPath][field] = this.parseOperator(value);
      } else if (key.startsWith('$') || key === 'search' || key === 'searchFields') {
        // Special filters
        specialFilters[key] = value;
      } else {
        // Direct field filter
        filters[key] = this.parseOperator(value);
      }
    }

    return {
      filters,
      relationshipFilters,
      specialFilters,
      hasRelationshipFilters: Object.keys(relationshipFilters).length > 0
    };
  }

  /**
   * Parse PostgREST-style operators
   * @param {string} value - Filter value with operator
   * @returns {Object} MongoDB filter object
   */
  parseOperator(value) {
    if (typeof value !== 'string') {
      return { $eq: value };
    }

    // PostgREST-style operators: "eq.value", "gt.10", "in.(a,b,c)"
    const operatorMatch = value.match(/^(\w+)\.(.+)$/);
    if (!operatorMatch) {
      return { $eq: value };
    }

    const [, operator, operand] = operatorMatch;

    switch (operator) {
      case 'eq':
        return { $eq: this.parseValue(operand) };
      case 'neq':
      case 'ne':
        return { $ne: this.parseValue(operand) };
      case 'gt':
        return { $gt: this.parseValue(operand) };
      case 'gte':
        return { $gte: this.parseValue(operand) };
      case 'lt':
        return { $lt: this.parseValue(operand) };
      case 'lte':
        return { $lte: this.parseValue(operand) };
      case 'in':
        return { $in: this.parseArrayValue(operand) };
      case 'nin':
        return { $nin: this.parseArrayValue(operand) };
      case 'like':
        return { $regex: this.escapeRegex(operand.replace(/\\*/g, '.*')), $options: 'i' };
      case 'ilike':
        return { $regex: this.escapeRegex(operand.replace(/\\*/g, '.*')), $options: 'i' };
      case 'regex':
        return { $regex: operand, $options: 'i' };
      case 'exists':
        return { $exists: this.parseValue(operand) };
      case 'null':
        return operand === 'true' ? { $eq: null } : { $ne: null };
      case 'empty':
        return operand === 'true'
          ? { $or: [{ $eq: null }, { $eq: '' }, { $size: 0 }] }
          : { $and: [{ $ne: null }, { $ne: '' }, { $not: { $size: 0 } }] };
      default:
        return { $eq: value };
    }
  }

  /**
   * Parse value with type coercion
   * @param {string} value - Value to parse
   * @returns {*} Parsed value
   */
  parseValue(value) {
    // Handle null
    if (value === 'null') return null;

    // Handle boolean
    if (value === 'true') return true;
    if (value === 'false') return false;

    // Handle numbers
    if (/^\d+$/.test(value)) return parseInt(value);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);

    // Handle ObjectId pattern
    if (/^[0-9a-fA-F]{24}$/.test(value)) return value;

    // Handle dates (ISO format)
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      return new Date(value);
    }

    // Handle date (simple format)
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Date(`${value}T00:00:00.000Z`);
    }

    return value;
  }

  /**
   * Parse array value from string like "(a,b,c)"
   * @param {string} value - Array value string
   * @returns {Array} Parsed array
   */
  parseArrayValue(value) {
    if (!value.startsWith('(') || !value.endsWith(')')) {
      return [this.parseValue(value)];
    }

    const innerValue = value.slice(1, -1);
    if (!innerValue) return [];

    return innerValue.split(',').map(v => this.parseValue(v.trim()));
  }

  /**
   * Escape regex special characters
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Build filtered aggregation pipeline
   * @param {string} collection - Collection name
   * @param {Array} selectFields - Parsed select fields
   * @param {Object} filters - Direct filters
   * @param {Object} relationshipFilters - Relationship filters
   * @param {Object} specialFilters - Special filters
   * @returns {Array} MongoDB aggregation pipeline
   */
  buildFilteredPipeline(collection, selectFields, filters, relationshipFilters, specialFilters) {
    const schema = this.schemas.get(collection);
    let pipeline = [];

    // Add direct filters first
    if (Object.keys(filters).length > 0) {
      pipeline.push({ $match: filters });
    }

    // Handle text search
    if (specialFilters.search) {
      const searchStage = this.buildTextSearchStage(collection, specialFilters.search, specialFilters.searchFields);
      if (searchStage) {
        pipeline.push(searchStage);
      }
    }

    // Build relationship pipeline
    if (selectFields && selectFields.length > 0) {
      const relationshipParser = require('./relationship-parser');
      const parser = new relationshipParser(this.schemas);
      const relationshipPipeline = parser.buildAggregationPipeline(collection, selectFields);
      pipeline.push(...relationshipPipeline);
    }

    // Add relationship filters
    pipeline = this.addRelationshipFilters(pipeline, schema, relationshipFilters);

    return pipeline;
  }

  /**
   * Build text search stage
   * @param {string} collection - Collection name
   * @param {string} searchTerm - Search term
   * @param {string} searchFields - Comma-separated search fields
   * @returns {Object|null} Search stage or null
   */
  buildTextSearchStage(collection, searchTerm, searchFields) {
    const schema = this.schemas.get(collection);
    const mongorestConfig = schema?.mongorest || {};

    // Use specified search fields or default from schema
    const fieldsToSearch = searchFields
      ? searchFields.split(',').map(f => f.trim())
      : mongorestConfig.searchFields || [];

    if (fieldsToSearch.length === 0) {
      // Try text index search if available
      return { $match: { $text: { $search: searchTerm } } };
    }

    // Build regex search across multiple fields
    const searchRegex = { $regex: this.escapeRegex(searchTerm), $options: 'i' };
    const orConditions = fieldsToSearch.map(field => ({ [field]: searchRegex }));

    return { $match: { $or: orConditions } };
  }

  /**
   * Add relationship filters to pipeline
   * @param {Array} pipeline - Existing pipeline
   * @param {Object} schema - Collection schema
   * @param {Object} relationshipFilters - Relationship filters
   * @returns {Array} Updated pipeline
   */
  addRelationshipFilters(pipeline, schema, relationshipFilters) {
    if (!schema?.relationships || Object.keys(relationshipFilters).length === 0) {
      return pipeline;
    }

    for (const [relationPath, relationFilter] of Object.entries(relationshipFilters)) {
      const relationship = schema.relationships[relationPath];

      if (relationship) {
        pipeline = this.addRelationshipFilter(pipeline, relationship, relationFilter, relationPath);
      }
    }

    return pipeline;
  }

  /**
   * Add single relationship filter to pipeline
   * @param {Array} pipeline - Existing pipeline
   * @param {Object} relationship - Relationship definition
   * @param {Object} filter - Filter conditions
   * @param {string} relationPath - Relationship path
   * @returns {Array} Updated pipeline
   */
  addRelationshipFilter(pipeline, relationship, filter, relationPath) {
    // Find existing lookup stage or create new one
    const lookupIndex = pipeline.findIndex(stage =>
      stage.$lookup && stage.$lookup.as === relationPath
    );

    if (lookupIndex !== -1) {
      // Add filter to existing lookup pipeline
      const lookupStage = pipeline[lookupIndex];
      if (!lookupStage.$lookup.pipeline) {
        lookupStage.$lookup.pipeline = [];
      }
      lookupStage.$lookup.pipeline.unshift({ $match: filter });
    } else {
      // Create new lookup stage with filter
      const lookupStage = this.createLookupWithFilter(relationship, filter, relationPath);
      pipeline.push(...lookupStage);
    }

    // For belongsTo relationships, ensure we match only documents with the related data
    if (relationship.type === 'belongsTo') {
      pipeline.push({
        $match: {
          [relationPath]: { $ne: null }
        }
      });
    }

    return pipeline;
  }

  /**
   * Create lookup stage with embedded filter
   * @param {Object} relationship - Relationship definition
   * @param {Object} filter - Filter conditions
   * @param {string} relationPath - Relationship path
   * @returns {Array} Array of pipeline stages
   */
  createLookupWithFilter(relationship, filter, relationPath) {
    const stages = [];

    switch (relationship.type) {
      case 'belongsTo':
        stages.push({
          $lookup: {
            from: relationship.collection,
            localField: relationship.localField,
            foreignField: relationship.foreignField,
            as: relationPath,
            pipeline: [{ $match: filter }]
          }
        });

        // Convert array to object
        stages.push({
          $addFields: {
            [relationPath]: { $arrayElemAt: [`$${relationPath}`, 0] }
          }
        });
        break;

      case 'hasMany':
        stages.push({
          $lookup: {
            from: relationship.collection,
            localField: relationship.localField,
            foreignField: relationship.foreignField,
            as: relationPath,
            pipeline: [{ $match: filter }]
          }
        });
        break;

      case 'manyToMany':
        const junctionAlias = `${relationPath}_junction`;

        // First lookup to junction table
        stages.push({
          $lookup: {
            from: relationship.through,
            localField: relationship.localField,
            foreignField: relationship.throughLocalField,
            as: junctionAlias
          }
        });

        // Second lookup to target collection with filter
        stages.push({
          $lookup: {
            from: relationship.collection,
            localField: `${junctionAlias}.${relationship.throughForeignField}`,
            foreignField: relationship.foreignField,
            as: relationPath,
            pipeline: [{ $match: filter }]
          }
        });

        // Remove junction field
        stages.push({
          $project: {
            [junctionAlias]: 0
          }
        });
        break;
    }

    return stages;
  }

  /**
   * Validate filter parameters
   * @param {string} collection - Collection name
   * @param {Object} filterParams - Filter parameters
   * @returns {Array} Array of validation errors
   */
  validateFilters(collection, filterParams) {
    const errors = [];
    const schema = this.schemas.get(collection);

    if (!schema) {
      errors.push(`Collection '${collection}' not found`);
      return errors;
    }

    for (const [key, value] of Object.entries(filterParams)) {
      // Skip non-filter parameters
      if (['select', 'sort', 'order', 'page', 'limit', 'offset'].includes(key)) {
        continue;
      }

      if (key.includes('.')) {
        // Validate relationship filter
        const [relationPath] = key.split('.');
        const relationship = schema.relationships?.[relationPath];

        if (!relationship) {
          errors.push(`Unknown relationship: ${relationPath} in collection ${collection}`);
        }
      } else if (!key.startsWith('$') && key !== 'search' && key !== 'searchFields') {
        // Validate direct field filter
        if (!schema.properties?.[key]) {
          errors.push(`Unknown field: ${key} in collection ${collection}`);
        }
      }

      // Validate operator syntax
      if (typeof value === 'string' && value.includes('.')) {
        const [operator] = value.split('.');
        const validOperators = [
          'eq', 'neq', 'ne', 'gt', 'gte', 'lt', 'lte',
          'in', 'nin', 'like', 'ilike', 'regex', 'exists', 'null', 'empty'
        ];

        if (!validOperators.includes(operator)) {
          errors.push(`Invalid operator '${operator}' for field ${key}`);
        }
      }
    }

    return errors;
  }

  /**
   * Build sorting pipeline
   * @param {string} sortField - Field to sort by
   * @param {string} sortOrder - Sort order (asc/desc/1/-1)
   * @param {Object} schema - Collection schema
   * @returns {Object|null} Sort stage or null
   */
  buildSortStage(sortField, sortOrder, schema) {
    if (!sortField) {
      // Use default sort from schema
      const mongorestConfig = schema?.mongorest || {};
      if (mongorestConfig.defaultSort) {
        return { $sort: mongorestConfig.defaultSort };
      }
      return null;
    }

    // Handle relationship sorting (future enhancement)
    if (sortField.includes('.')) {
      // For now, skip relationship sorting
      return null;
    }

    // Validate field exists
    if (!schema.properties?.[sortField]) {
      throw new Error(`Sort field '${sortField}' not found in collection`);
    }

    const direction = ['desc', '-1'].includes(sortOrder) ? -1 : 1;
    return { $sort: { [sortField]: direction } };
  }

  /**
   * Build pagination stages
   * @param {number} page - Page number (1-based)
   * @param {number} limit - Items per page
   * @param {Object} schema - Collection schema
   * @returns {Array} Array of pagination stages
   */
  buildPaginationStages(page, limit, schema) {
    const stages = [];
    const mongorestConfig = schema?.mongorest || {};

    // Apply limits
    const maxLimit = mongorestConfig.maxLimit || 1000;
    const defaultLimit = mongorestConfig.defaultLimit || 50;
    const actualLimit = Math.min(limit || defaultLimit, maxLimit);

    // Calculate skip
    const actualPage = Math.max(page || 1, 1);
    const skip = (actualPage - 1) * actualLimit;

    if (skip > 0) {
      stages.push({ $skip: skip });
    }

    stages.push({ $limit: actualLimit });

    return stages;
  }
}

export default RelationshipFilterParser;
