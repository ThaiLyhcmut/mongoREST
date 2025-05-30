import { MongoFilter, ParsedFilters, PipelineStage, Relationship, Schema, SchemaLoader } from '../config/core/relationship-filter.config';
import RelationshipQueryParser from './relationship-parser';

type FilterParams = Record<string, string | number | boolean | null>;

/**
 * RelationshipFilterParser - Handle filtering on relationships
 * Supports PostgREST-style operators: eq, neq, gt, gte, lt, lte, in, nin, like, ilike
 */
class RelationshipFilterParser {
  private schemas: Map<string, Schema>;

  constructor(schemaLoader: SchemaLoader) {
    this.schemas = schemaLoader.schemas;
  }

  /**
   * Parse filter parameters including relationship filters
   */
  parseFilters(collection: string, filterParams: FilterParams): ParsedFilters {
    const filters: Record<string, any> = {};
    const relationshipFilters: Record<string, Record<string, any>> = {};
    const specialFilters: Record<string, any> = {};

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
   */
  parseOperator(value: string | number | boolean | null): MongoFilter | { $eq: any } {
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
        return { $exists: this.parseValue(operand) as boolean };
      case 'null':
        return operand === 'true' ? { $eq: null } : { $ne: null };
      case 'empty':
        return operand === 'true' ? 
          { $or: [{ $eq: null }, { $eq: '' }, { $size: 0 }] } :
          { $and: [{ $ne: null }, { $ne: '' }, { $not: { $size: 0 } }] };
      default:
        return { $eq: value };
    }
  }

  /**
   * Parse value with type coercion
   */
  parseValue(value: string): any {
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
      return new Date(value + 'T00:00:00.000Z');
    }
    
    return value;
  }

  /**
   * Parse array value from string like "(a,b,c)"
   */
  parseArrayValue(value: string): any[] {
    if (!value.startsWith('(') || !value.endsWith(')')) {
      return [this.parseValue(value)];
    }
    
    const innerValue = value.slice(1, -1);
    if (!innerValue) return [];
    
    return innerValue.split(',').map(v => this.parseValue(v.trim()));
  }

  /**
   * Escape regex special characters
   */
  escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Build filtered aggregation pipeline
   */
  buildFilteredPipeline(
    collection: string, 
    selectFields: any[], 
    filters: Record<string, any>, 
    relationshipFilters: Record<string, Record<string, any>>, 
    specialFilters: Record<string, any>
  ): PipelineStage[] {
    const schema = this.schemas.get(collection);
    let pipeline: PipelineStage[] = [];

    // Add direct filters first
    if (Object.keys(filters).length > 0) {
      pipeline.push({ $match: filters });
    }

    // Handle text search
    if (specialFilters.search) {
      const searchStage = this.buildTextSearchStage(collection, specialFilters.search as string, specialFilters.searchFields as string);
      if (searchStage) {
        pipeline.push(searchStage);
      }
    }

    // Build relationship pipeline
    if (selectFields && selectFields.length > 0) {
      const parser = new RelationshipQueryParser(this.schemas as any);
      const relationshipPipeline = parser.buildAggregationPipeline(collection, selectFields);
      pipeline.push(...relationshipPipeline);
    }

    // Add relationship filters
    pipeline = this.addRelationshipFilters(pipeline, schema, relationshipFilters);

    return pipeline;
  }

  /**
   * Build text search stage
   */
  buildTextSearchStage(collection: string, searchTerm: string, searchFields?: string): PipelineStage | null {
    const schema = this.schemas.get(collection);
    const mongorestConfig = schema?.mongorest || {};
    
    // Use specified search fields or default from schema
    const fieldsToSearch = searchFields ? 
      searchFields.split(',').map(f => f.trim()) : 
      mongorestConfig.searchFields || [];

    if (fieldsToSearch.length === 0) {
      // Try text index search if available
      return { $match: { fieldName: { $regex: searchTerm, $options: "i" } } };
    }

    // Build regex search across multiple fields
    const searchRegex = { $regex: this.escapeRegex(searchTerm), $options: 'i' };
    const orConditions = fieldsToSearch.map(field => ({ [field]: searchRegex }));

    return { $match: { $or: orConditions } };
  }

  /**
   * Add relationship filters to pipeline
   */
  addRelationshipFilters(
    pipeline: PipelineStage[], 
    schema: Schema | undefined, 
    relationshipFilters: Record<string, Record<string, any>>
  ): PipelineStage[] {
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
   */
  addRelationshipFilter(
    pipeline: PipelineStage[], 
    relationship: Relationship, 
    filter: Record<string, any>, 
    relationPath: string
  ): PipelineStage[] {
    // Find existing lookup stage or create new one
    const lookupIndex = pipeline.findIndex(stage => 
      stage.$lookup && stage.$lookup.as === relationPath
    );

    if (lookupIndex !== -1) {
      // Add filter to existing lookup pipeline
      const lookupStage = pipeline[lookupIndex];
      if (lookupStage.$lookup && !lookupStage.$lookup.pipeline) {
        lookupStage.$lookup.pipeline = [];
      }
      lookupStage.$lookup?.pipeline?.unshift({ $match: filter });
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
   */
  createLookupWithFilter(relationship: Relationship, filter: Record<string, any>, relationPath: string): PipelineStage[] {
    const stages: PipelineStage[] = [];

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
            from: relationship.through!,
            localField: relationship.localField,
            foreignField: relationship.throughLocalField!,
            as: junctionAlias
          }
        });
        
        // Second lookup to target collection with filter
        stages.push({
          $lookup: {
            from: relationship.collection,
            localField: `${junctionAlias}.${relationship.throughForeignField!}`,
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
   */
  validateFilters(collection: string, filterParams: FilterParams): string[] {
    const errors: string[] = [];
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
   */
  buildSortStage(sortField?: string, sortOrder?: string, schema?: Schema): PipelineStage | null {
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
    if (!schema?.properties?.[sortField]) {
      throw new Error(`Sort field '${sortField}' not found in collection`);
    }

    const direction = ['desc', '-1'].includes(sortOrder || '') ? -1 : 1;
    return { $sort: { [sortField]: direction } };
  }

  /**
   * Build pagination stages
   */
  buildPaginationStages(page?: number, limit?: number, schema?: Schema): PipelineStage[] {
    const stages: PipelineStage[] = [];
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