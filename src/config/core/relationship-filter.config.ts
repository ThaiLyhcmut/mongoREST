// Type definitions
export interface SchemaProperty {
  type: string;
  [key: string]: any;
}

export interface MongorestConfig {
  searchFields?: string[];
  defaultSort?: Record<string, 1 | -1>;
  maxLimit?: number;
  defaultLimit?: number;
}

export interface Relationship {
  type: 'belongsTo' | 'hasMany' | 'manyToMany';
  collection: string;
  localField: string;
  foreignField: string;
  through?: string;
  throughLocalField?: string;
  throughForeignField?: string;
}

export interface Schema {
  properties?: Record<string, SchemaProperty>;
  relationships?: Record<string, Relationship>;
  mongorest?: MongorestConfig;
}

export interface SchemaLoader {
  schemas: Map<string, Schema>;
}

export interface ParsedFilters {
  filters: Record<string, any>;
  relationshipFilters: Record<string, Record<string, any>>;
  specialFilters: Record<string, any>;
  hasRelationshipFilters: boolean;
}

export interface MongoFilter {
  $eq?: any;
  $ne?: any;
  $gt?: any;
  $gte?: any;
  $lt?: any;
  $lte?: any;
  $in?: any[];
  $nin?: any[];
  $regex?: string;
  $options?: string;
  $exists?: boolean;
  $or?: any[];
  $and?: any[];
  $not?: any;
  $size?: number;
}

export interface PipelineStage {
  $match?: any;
  $lookup?: {
    from: string;
    localField: string;
    foreignField: string;
    as: string;
    pipeline?: PipelineStage[];
  };
  $addFields?: Record<string, any>;
  $project?: Record<string, 0 | 1>;
  $sort?: Record<string, 1 | -1>;
  $skip?: number;
  $limit?: number;
}