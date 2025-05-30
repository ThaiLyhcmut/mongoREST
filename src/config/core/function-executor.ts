import { Collection, ObjectId } from "mongodb";

// Type definitions
export interface SchemaLoader {
  schemas: Map<string, any>;
  functions: Map<string, FunctionDefinition>;
  validateFunctionInput(functionName: string, params: any): ValidationResult;
}

export interface DbManager {
  collection(name: string): Collection;
}

export interface ValidationResult {
  valid: boolean;
  errors?: any[];
}

export interface User {
  sub: string;
  [key: string]: any;
}

export interface ExecutionContext {
  functionName: string;
  params: any;
  steps: Map<string, StepResult>;
  output: any;
  user?: User;
  config: Record<string, any>;
  now: string;
  startTime: number;
  errors: any[];
}

export interface StepResult {
  output: any;
  executionTime: number;
  timestamp: string;
}

export interface FunctionResult {
  success: boolean;
  function: string;
  result?: any;
  error?: string;
  meta: {
    executionTime: string;
    stepsExecuted?: number;
    timestamp: string;
  };
}

export interface BaseStep {
  id: string;
  type: string;
  [key: string]: any;
}

export interface MongoStep extends BaseStep {
  collection: string;
  query?: any;
  options?: any;
}

export interface FindStep extends MongoStep {
  type: 'find';
}

export interface FindOneStep extends MongoStep {
  type: 'findOne';
}

export interface InsertOneStep extends BaseStep {
  type: 'insertOne';
  collection: string;
  document: any;
}

export interface InsertManyStep extends BaseStep {
  type: 'insertMany';
  collection: string;
  documents: any[];
}

export interface UpdateOneStep extends BaseStep {
  type: 'updateOne';
  collection: string;
  filter: any;
  update: any;
  options?: any;
}

export interface UpdateManyStep extends BaseStep {
  type: 'updateMany';
  collection: string;
  filter: any;
  update: any;
  options?: any;
}

export interface DeleteOneStep extends BaseStep {
  type: 'deleteOne';
  collection: string;
  filter: any;
}

export interface DeleteManyStep extends BaseStep {
  type: 'deleteMany';
  collection: string;
  filter: any;
}

export interface AggregateStep extends BaseStep {
  type: 'aggregate';
  collection: string;
  pipeline: any[];
  options?: any;
}

export interface CountStep extends BaseStep {
  type: 'countDocuments';
  collection: string;
  query?: any;
}

export interface DistinctStep extends BaseStep {
  type: 'distinct';
  collection: string;
  field: string;
  query?: any;
}

export interface TransformStep extends BaseStep {
  type: 'transform';
  script: string;
  input?: any;
}

export interface ConditionStep extends BaseStep {
  type: 'condition';
  condition: string;
  then?: BaseStep[];
  else?: BaseStep[];
}

export interface HttpStep extends BaseStep {
  type: 'http';
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
}

export interface DelayStep extends BaseStep {
  type: 'delay';
  duration?: number;
}



export interface FunctionHooks {
  beforeExecution?: string[];
  afterExecution?: string[];
  onError?: string[];
}

export interface ErrorHandling {
  strategy?: 'rollback' | 'retry' | 'ignore';
  rollbackSteps?: string[];
  retryCount?: number;
}

export type Step = FindStep | FindOneStep | InsertOneStep | InsertManyStep | 
           UpdateOneStep | UpdateManyStep | DeleteOneStep | DeleteManyStep |
           AggregateStep | CountStep | DistinctStep | TransformStep | 
           ConditionStep | HttpStep | DelayStep;

export interface FunctionDefinition {
  name: string;
  description?: string;
  method?: string;
  category?: string;
  permissions?: string[];
  input?: any;
  output?: any;
  steps: Step[];
  hooks?: FunctionHooks;
  errorHandling?: ErrorHandling;
}

export interface FunctionContext {
  user?: User;
  config?: Record<string, any>;
}

export interface HttpResponse {
  status: number;
  success: boolean;
  data: any;
  headers: Record<string, string>;
}

export interface DelayResult {
  delayed: number;
  timestamp: string;
}

export interface InsertOneResult {
  insertedId: ObjectId;
  acknowledged: boolean;
  document: any;
}

export interface InsertManyResult {
  insertedIds: Record<number, ObjectId>;
  insertedCount: number;
  acknowledged: boolean;
}

export interface UpdateResult {
  matchedCount: number;
  modifiedCount: number;
  acknowledged: boolean;
}

export interface DeleteResult {
  deletedCount: number;
  acknowledged: boolean;
}

export interface ConditionResult {
  condition: boolean;
  results: any[];
}

export interface UserReportInput {
  userStats: any[];
  newUsers: any[];
  activeUsers: any[];
  segments: string[];
}

export interface UserOrderInput {
  userStats: any[];
  orderStats: any[];
}

export interface ProcessedReport {
  summary: {
    totalUsers: number;
    activeUsers: number;
    newUsers: number;
  };
  segments: Array<{
    type: string;
    data: any;
  }>;
  trends: {
    daily: any[];
    weekly: any[];
    monthly: any[];
  };
}

export interface FunctionSummary {
  name: string;
  description?: string;
  method?: string;
  category?: string;
  steps: number;
  permissions?: string[];
}

export interface ExecutionStats {
  totalFunctions: number;
  supportedStepTypes: string[];
  availableTransforms: string[];
}