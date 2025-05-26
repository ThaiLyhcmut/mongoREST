const { ObjectId } = require('mongodb');

/**
 * RelationshipQueryParser - Parse PostgREST-style relationship queries
 * Supports syntax like: "id,title,author(*),category(name,slug),comments(content,user:userId(name))"
 */
class RelationshipQueryParser {
  constructor(schemaLoader) {
    this.schemas = schemaLoader.schemas;
  }

  /**
   * Parse select query string into structured fields
   * @param {string} collection - Collection name
   * @param {string} selectParam - Select parameter string
   * @returns {Object} Parsed fields and aggregation pipeline
   */
  parseSelectQuery(collection, selectParam) {
    if (!selectParam || selectParam.trim() === '') {
      return { fields: [], pipeline: [] };
    }

    const selectFields = this.parseSelectFields(selectParam);
    const pipeline = this.buildAggregationPipeline(collection, selectFields);
    
    return {
      fields: selectFields,
      pipeline: pipeline,
      hasRelationships: selectFields.some(f => f.type === 'relationship')
    };
  }

  /**
   * Parse select fields string into structured format
   * @param {string} selectParam - Select parameter string
   * @returns {Array} Array of field objects
   */
  parseSelectFields(selectParam) {
    const fields = [];
    let currentField = '';
    let depth = 0;
    let inParens = false;

    for (let i = 0; i < selectParam.length; i++) {
      const char = selectParam[i];
      
      if (char === '(') {
        depth++;
        inParens = true;
      } else if (char === ')') {
        depth--;
        if (depth === 0) inParens = false;
      } else if (char === ',' && depth === 0) {
        if (currentField.trim()) {
          fields.push(this.parseField(currentField.trim()));
        }
        currentField = '';
        continue;
      }
      
      currentField += char;
    }
    
    if (currentField.trim()) {
      fields.push(this.parseField(currentField.trim()));
    }
    
    return fields;
  }

  /**
   * Parse individual field into structured format
   * @param {string} fieldStr - Field string
   * @returns {Object} Parsed field object
   */
  parseField(fieldStr) {
    // Handle different patterns:
    // "id" -> simple field
    // "author(*)" -> relationship with all fields
    // "author(name,email)" -> relationship with specific fields
    // "author:authorId(name,email)" -> relationship with explicit foreign key
    // "commentCount:comments!count" -> aggregated relationship
    // "topComments:comments!order.createdAt.desc!limit.5" -> relationship with modifiers
    
    const relationshipMatch = fieldStr.match(/^(\w+)(?::(\w+))?\(([^)]*)\)(?:(![\w.!]+)*)$/);
    const aggregateMatch = fieldStr.match(/^(\w+):(\w+)!(count|sum|avg|min|max)(?:\(([^)]*)\))?$/);
    const modifierMatch = fieldStr.match(/^(\w+):(\w+)(?:\(([^)]*)\))?(![\w.!]+)+$/);
    
    if (aggregateMatch) {
      const [, alias, relationName, aggregateType, aggregateField] = aggregateMatch;
      return {
        type: 'aggregate',
        alias,
        relationName,
        aggregateType,
        aggregateField,
        subFields: []
      };
    }
    
    if (modifierMatch) {
      const [, alias, relationName, subFieldsStr, modifiersStr] = modifierMatch;
      const modifiers = this.parseModifiers(modifiersStr);
      return {
        type: 'relationship',
        alias,
        relationName,
        subFields: subFieldsStr ? this.parseSelectFields(subFieldsStr) : ['*'],
        modifiers
      };
    }
    
    if (relationshipMatch) {
      const [, alias, explicitField, subFields, modifiersStr] = relationshipMatch;
      const modifiers = modifiersStr ? this.parseModifiers(modifiersStr) : {};
      
      return {
        type: 'relationship',
        alias,
        explicitField,
        subFields: subFields === '*' ? ['*'] : this.parseSelectFields(subFields),
        modifiers
      };
    }
    
    return {
      type: 'field',
      name: fieldStr
    };
  }

  /**
   * Parse relationship modifiers like !order.createdAt.desc!limit.5
   * @param {string} modifiersStr - Modifiers string
   * @returns {Object} Parsed modifiers
   */
  parseModifiers(modifiersStr) {
    const modifiers = {};
    const parts = modifiersStr.split('!').filter(Boolean);
    
    for (const part of parts) {
      if (part.startsWith('order.')) {
        const [, field, direction] = part.split('.');
        modifiers.sort = { [field]: direction === 'desc' ? -1 : 1 };
      } else if (part.startsWith('limit.')) {
        modifiers.limit = parseInt(part.split('.')[1]);
      } else if (part.startsWith('skip.')) {
        modifiers.skip = parseInt(part.split('.')[1]);
      } else if (part === 'inner') {
        modifiers.joinType = 'inner';
      }
    }
    
    return modifiers;
  }

  /**
   * Build MongoDB aggregation pipeline from parsed fields
   * @param {string} collection - Collection name
   * @param {Array} selectFields - Parsed select fields
   * @returns {Array} MongoDB aggregation pipeline
   */
  buildAggregationPipeline(collection, selectFields) {
    const schema = this.schemas.get(collection);
    if (!schema?.relationships) {
      return this.buildProjectPipeline(selectFields);
    }

    const pipeline = [];
    const projectStage = {};
    const lookupStages = [];

    // Process each select field
    for (const field of selectFields) {
      if (field.type === 'field') {
        projectStage[field.name] = 1;
      } else if (field.type === 'relationship') {
        const relationship = schema.relationships[field.alias] || schema.relationships[field.relationName];
        if (relationship) {
          const lookupStage = this.buildLookupStage(relationship, field, collection);
          lookupStages.push(...lookupStage);
          projectStage[field.alias] = 1;
        }
      } else if (field.type === 'aggregate') {
        const relationship = schema.relationships[field.relationName];
        if (relationship) {
          const aggregateStage = this.buildAggregateStage(relationship, field, collection);
          lookupStages.push(...aggregateStage);
          projectStage[field.alias] = 1;
        }
      }
    }

    // Add lookup stages
    pipeline.push(...lookupStages);
    
    // Add project stage if we have specific field selection
    if (Object.keys(projectStage).length > 0) {
      pipeline.push({ $project: projectStage });
    }

    return pipeline;
  }

  /**
   * Build simple project pipeline for non-relationship queries
   * @param {Array} selectFields - Select fields
   * @returns {Array} Pipeline with project stage
   */
  buildProjectPipeline(selectFields) {
    const projectStage = {};
    let hasFields = false;

    for (const field of selectFields) {
      if (field.type === 'field') {
        projectStage[field.name] = 1;
        hasFields = true;
      }
    }

    return hasFields ? [{ $project: projectStage }] : [];
  }

  /**
   * Build lookup stage for relationship
   * @param {Object} relationship - Relationship definition
   * @param {Object} field - Parsed field object
   * @param {string} collection - Source collection
   * @returns {Array} Array of pipeline stages
   */
  buildLookupStage(relationship, field, collection) {
    const stages = [];

    switch (relationship.type) {
      case 'belongsTo':
        stages.push({
          $lookup: {
            from: relationship.collection,
            localField: relationship.localField,
            foreignField: relationship.foreignField,
            as: field.alias,
            pipeline: this.buildSubPipeline(field.subFields, relationship.collection, field.modifiers)
          }
        });
        
        // Convert array to object for belongsTo
        stages.push({
          $addFields: {
            [field.alias]: { $arrayElemAt: [`$${field.alias}`, 0] }
          }
        });
        break;

      case 'hasMany':
        let pipeline = this.buildSubPipeline(field.subFields, relationship.collection, field.modifiers);
        
        // Apply default filters if defined
        if (relationship.defaultFilters) {
          pipeline.unshift({ $match: relationship.defaultFilters });
        }
        
        // Apply default sort if no sort specified
        if (!field.modifiers?.sort && relationship.defaultSort) {
          pipeline.push({ $sort: relationship.defaultSort });
        }
        
        // Apply pagination limits
        if (relationship.pagination) {
          const limit = field.modifiers?.limit || relationship.pagination.defaultLimit;
          if (limit) {
            pipeline.push({ $limit: Math.min(limit, relationship.pagination.maxLimit || 1000) });
          }
        }

        stages.push({
          $lookup: {
            from: relationship.collection,
            localField: relationship.localField,
            foreignField: relationship.foreignField,
            as: field.alias,
            pipeline
          }
        });
        break;

      case 'manyToMany':
        stages.push(...this.buildManyToManyStages(relationship, field));
        break;
    }

    return stages;
  }

  /**
   * Build stages for many-to-many relationships
   * @param {Object} relationship - Relationship definition
   * @param {Object} field - Parsed field object
   * @returns {Array} Array of pipeline stages
   */
  buildManyToManyStages(relationship, field) {
    const stages = [];
    const junctionAlias = `${field.alias}_junction`;
    
    // First lookup to junction table
    stages.push({
      $lookup: {
        from: relationship.through,
        localField: relationship.localField,
        foreignField: relationship.throughLocalField,
        as: junctionAlias
      }
    });
    
    // Second lookup to target collection
    stages.push({
      $lookup: {
        from: relationship.collection,
        localField: `${junctionAlias}.${relationship.throughForeignField}`,
        foreignField: relationship.foreignField,
        as: field.alias,
        pipeline: this.buildSubPipeline(field.subFields, relationship.collection, field.modifiers)
      }
    });
    
    // Remove junction field
    stages.push({
      $project: {
        [junctionAlias]: 0
      }
    });

    return stages;
  }

  /**
   * Build aggregate stage for aggregated relationships
   * @param {Object} relationship - Relationship definition
   * @param {Object} field - Parsed field object
   * @param {string} collection - Source collection
   * @returns {Array} Array of pipeline stages
   */
  buildAggregateStage(relationship, field, collection) {
    const stages = [];
    const tempAlias = `${field.alias}_temp`;
    
    // Build lookup stage
    stages.push({
      $lookup: {
        from: relationship.collection,
        localField: relationship.localField,
        foreignField: relationship.foreignField,
        as: tempAlias
      }
    });
    
    // Build aggregation based on type
    let aggregateExpression;
    switch (field.aggregateType) {
      case 'count':
        aggregateExpression = { $size: `$${tempAlias}` };
        break;
      case 'sum':
        aggregateExpression = { $sum: `$${tempAlias}.${field.aggregateField}` };
        break;
      case 'avg':
        aggregateExpression = { $avg: `$${tempAlias}.${field.aggregateField}` };
        break;
      case 'min':
        aggregateExpression = { $min: `$${tempAlias}.${field.aggregateField}` };
        break;
      case 'max':
        aggregateExpression = { $max: `$${tempAlias}.${field.aggregateField}` };
        break;
      default:
        aggregateExpression = { $size: `$${tempAlias}` };
    }
    
    // Add computed field and remove temp field
    stages.push({
      $addFields: {
        [field.alias]: aggregateExpression
      }
    });
    
    stages.push({
      $project: {
        [tempAlias]: 0
      }
    });
    
    return stages;
  }

  /**
   * Build sub-pipeline for nested relationships
   * @param {Array} subFields - Sub-fields to select
   * @param {string} collection - Target collection
   * @param {Object} modifiers - Query modifiers
   * @returns {Array} Sub-pipeline array
   */
  buildSubPipeline(subFields, collection, modifiers = {}) {
    if (!subFields || subFields.length === 0 || subFields[0] === '*') {
      const pipeline = [];
      
      // Apply modifiers
      if (modifiers.sort) {
        pipeline.push({ $sort: modifiers.sort });
      }
      if (modifiers.skip) {
        pipeline.push({ $skip: modifiers.skip });
      }
      if (modifiers.limit) {
        pipeline.push({ $limit: modifiers.limit });
      }
      
      return pipeline;
    }

    const pipeline = [];
    const projectStage = {};
    const nestedLookups = [];
    
    for (const subField of subFields) {
      if (subField.type === 'field') {
        projectStage[subField.name] = 1;
      } else if (subField.type === 'relationship') {
        // Handle nested relationships
        const subSchema = this.schemas.get(collection);
        const subRelationship = subSchema?.relationships?.[subField.alias];
        if (subRelationship) {
          const nestedLookup = this.buildLookupStage(subRelationship, subField, collection);
          nestedLookups.push(...nestedLookup);
          projectStage[subField.alias] = 1;
        }
      }
    }

    // Add nested lookups first
    pipeline.push(...nestedLookups);
    
    // Apply modifiers
    if (modifiers.sort) {
      pipeline.push({ $sort: modifiers.sort });
    }
    if (modifiers.skip) {
      pipeline.push({ $skip: modifiers.skip });
    }
    if (modifiers.limit) {
      pipeline.push({ $limit: modifiers.limit });
    }

    // Add project stage if we have specific field selection
    if (Object.keys(projectStage).length > 0) {
      pipeline.push({ $project: projectStage });
    }

    return pipeline;
  }

  /**
   * Validate relationship query against schema
   * @param {string} collection - Collection name
   * @param {Array} selectFields - Parsed select fields
   * @returns {Array} Array of validation errors
   */
  validateRelationshipQuery(collection, selectFields) {
    const schema = this.schemas.get(collection);
    const errors = [];

    if (!schema) {
      errors.push(`Collection '${collection}' not found`);
      return errors;
    }

    for (const field of selectFields) {
      if (field.type === 'relationship' || field.type === 'aggregate') {
        const relationName = field.relationName || field.alias;
        const relationship = schema.relationships?.[relationName];
        
        if (!relationship) {
          errors.push(`Unknown relationship: ${relationName} in collection ${collection}`);
          continue;
        }

        // Validate target collection exists
        const targetSchema = this.schemas.get(relationship.collection);
        if (!targetSchema) {
          errors.push(`Target collection not found: ${relationship.collection}`);
        }

        // Validate sub-fields for relationship queries
        if (field.type === 'relationship' && field.subFields && field.subFields[0] !== '*') {
          const subErrors = this.validateSubFields(field.subFields, relationship.collection);
          errors.push(...subErrors);
        }

        // Validate modifiers
        if (field.modifiers) {
          const modifierErrors = this.validateModifiers(field.modifiers, relationship);
          errors.push(...modifierErrors);
        }
      }
    }

    return errors;
  }

  /**
   * Validate sub-fields against target collection schema
   * @param {Array} subFields - Sub-fields to validate
   * @param {string} collection - Target collection
   * @returns {Array} Array of validation errors
   */
  validateSubFields(subFields, collection) {
    const errors = [];
    const targetSchema = this.schemas.get(collection);
    
    if (!targetSchema) {
      return [`Target collection not found: ${collection}`];
    }

    for (const subField of subFields) {
      if (subField.type === 'field') {
        if (!targetSchema.properties?.[subField.name]) {
          errors.push(`Field '${subField.name}' not found in collection ${collection}`);
        }
      } else if (subField.type === 'relationship') {
        // Recursively validate nested relationships
        const nestedErrors = this.validateRelationshipQuery(collection, [subField]);
        errors.push(...nestedErrors);
      }
    }

    return errors;
  }

  /**
   * Validate relationship modifiers
   * @param {Object} modifiers - Modifiers to validate
   * @param {Object} relationship - Relationship definition
   * @returns {Array} Array of validation errors
   */
  validateModifiers(modifiers, relationship) {
    const errors = [];

    // Validate limit against relationship constraints
    if (modifiers.limit && relationship.pagination) {
      if (modifiers.limit > relationship.pagination.maxLimit) {
        errors.push(`Limit ${modifiers.limit} exceeds maximum ${relationship.pagination.maxLimit} for relationship`);
      }
    }

    // Validate sort fields exist in target collection
    if (modifiers.sort) {
      const targetSchema = this.schemas.get(relationship.collection);
      for (const sortField of Object.keys(modifiers.sort)) {
        if (!targetSchema?.properties?.[sortField]) {
          errors.push(`Sort field '${sortField}' not found in collection ${relationship.collection}`);
        }
      }
    }

    return errors;
  }
}

module.exports = RelationshipQueryParser;
