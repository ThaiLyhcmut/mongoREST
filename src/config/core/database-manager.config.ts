// Database Manager Configuration and Types

import { MongoClient, Db, Collection, ClientSession } from 'mongodb';

// Database connection configuration
export interface DatabaseConfig {
  url: string;
  databaseName: string;
  options?: DatabaseConnectionOptions;
}

// MongoDB connection options
export interface DatabaseConnectionOptions {
  maxPoolSize?: number;
  minPoolSize?: number;
  maxIdleTimeMS?: number;
  serverSelectionTimeoutMS?: number;
  socketTimeoutMS?: number;
  connectTimeoutMS?: number;
  heartbeatFrequencyMS?: number;
  retryWrites?: boolean;
  retryReads?: boolean;
  readPreference?: 'primary' | 'primaryPreferred' | 'secondary' | 'secondaryPreferred' | 'nearest';
  readConcern?: {
    level: 'local' | 'available' | 'majority' | 'linearizable' | 'snapshot';
  };
  writeConcern?: {
    w?: number | 'majority';
    j?: boolean;
    wtimeout?: number;
  };
  compression?: ('snappy' | 'zlib' | 'zstd')[];
  ssl?: boolean;
  sslValidate?: boolean;
  authSource?: string;
  authMechanism?: string;
  directConnection?: boolean;
  replicaSet?: string;
  family?: 4 | 6; // IPv4 or IPv6
}

// Database manager configuration (used in constructor)
export interface DatabaseManagerConfig {
  connectionString?: string;
  databaseName?: string;
  options?: DatabaseConnectionOptions;
  enableHealthCheck?: boolean;
  healthCheckInterval?: number;
  enableMetrics?: boolean;
  metricsInterval?: number;
  enableConnectionPooling?: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
  enableLogging?: boolean;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
}

// Database manager options
export interface DatabaseManagerOptions {
  config: DatabaseConfig;
  enableHealthCheck?: boolean;
  healthCheckInterval?: number;
  enableMetrics?: boolean;
  metricsInterval?: number;
  enableConnectionPooling?: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
  enableLogging?: boolean;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
}

// Connection state
export interface ConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  connectionError?: Error;
  connectedAt?: Date;
  lastPingAt?: Date;
  pingLatency?: number;
  retryCount: number;
  maxRetries: number;
}

// Health check result (used in database-manager.ts)
export interface HealthCheckResult {
  status: 'connected' | 'disconnected' | 'error';
  database?: string;
  serverStatus?: any;
  stats?: {
    collections: number;
    documents: number;
    dataSize: string;
    storageSize: string;
    indexes: number;
    indexSize: string;
  };
  connection?: {
    host: string;
    poolSize: number;
    connected: boolean;
  };
  error?: string;
}

// Database health check result (enhanced version)
export interface DatabaseHealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  latency: number;
  error?: string;
  details: {
    connectionStatus: string;
    serverStatus?: any;
    replicationStatus?: any;
    indexStatus?: any;
  };
}

// Pagination result (used in findWithPagination)
export interface PaginationResult<T> {
  documents: T[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

// Find options (used in findWithPagination)
export interface FindOptions {
  page?: number;
  limit?: number;
  sort?: { [field: string]: 1 | -1 };
  projection?: { [field: string]: 0 | 1 };
  skip?: number;
  maxTimeMS?: number;
  hint?: string | { [field: string]: 1 | -1 };
  readPreference?: string;
  session?: ClientSession;
  [key: string]: any;
}

// Index definition (used in createIndexes)
export interface IndexDefinition {
  name?: string;
  fields: { [field: string]: 1 | -1 | 'text' | '2dsphere' | 'hashed' };
  unique?: boolean;
  sparse?: boolean;
  background?: boolean;
  partialFilterExpression?: any;
  expireAfterSeconds?: number;
  options?: {
    [key: string]: any;
  };
}

// Collection info (used in listCollections)
export interface CollectionInfo {
  name: string;
  type: string | undefined;
  options?: any;
}

// Database stats (used in getStats method)
export interface DatabaseStats {
  database: {
    name: string;
    collections: number;
    documents: number;
    dataSize: string;
    storageSize: string;
    indexes: number;
    indexSize: string;
  };
  server: {
    version: string;
    uptime: number;
    connections: any;
    memory: {
      resident: string;
      virtual: string;
    };
    metrics: {
      operations: any;
      network: {
        bytesIn: string;
        bytesOut: string;
      };
    };
  };
}

// Database metrics
export interface DatabaseMetrics {
  connections: {
    active: number;
    available: number;
    created: number;
    destroyed: number;
  };
  operations: {
    totalQueries: number;
    totalInserts: number;
    totalUpdates: number;
    totalDeletes: number;
    averageLatency: number;
    errorsCount: number;
  };
  performance: {
    cpuUsage?: number;
    memoryUsage?: number;
    diskUsage?: number;
    networkIO?: number;
  };
  timestamp: Date;
}

// Transaction options
export interface TransactionOptions {
  readPreference?: 'primary' | 'primaryPreferred' | 'secondary' | 'secondaryPreferred' | 'nearest';
  readConcern?: {
    level: 'local' | 'available' | 'majority' | 'linearizable' | 'snapshot';
  };
  writeConcern?: {
    w?: number | 'majority';
    j?: boolean;
    wtimeout?: number;
  };
  maxCommitTimeMS?: number;
}

// Transaction callback function
export type TransactionCallback<T = any> = (session: ClientSession) => Promise<T>;

// Collection operation options
export interface CollectionOperationOptions {
  session?: ClientSession;
  timeout?: number;
  retries?: number;
  validate?: boolean;
  audit?: boolean;
  maxTimeMS?: number;
  ordered?: boolean;
}

// Bulk operation result
export interface BulkOperationResult {
  acknowledged: boolean;
  insertedCount?: number;
  insertedIds?: { [index: number]: any };
  matchedCount?: number;
  modifiedCount?: number;
  deletedCount?: number;
  upsertedCount?: number;
  upsertedIds?: { [index: number]: any };
  errors?: BulkWriteError[];
}

// Bulk write error
export interface BulkWriteError {
  index: number;
  code: number;
  errmsg: string;
  op: any;
}

// Index creation options
export interface IndexCreationOptions {
  unique?: boolean;
  sparse?: boolean;
  background?: boolean;
  name?: string;
  partialFilterExpression?: any;
  expireAfterSeconds?: number;
  collation?: {
    locale: string;
    caseLevel?: boolean;
    caseFirst?: string;
    strength?: number;
    numericOrdering?: boolean;
    alternate?: string;
    maxVariable?: string;
    backwards?: boolean;
  };
}

// Index information
export interface IndexInfo {
  name: string;
  key: { [field: string]: 1 | -1 | 'text' | '2dsphere' | 'hashed' };
  unique?: boolean;
  sparse?: boolean;
  background?: boolean;
  partialFilterExpression?: any;
  expireAfterSeconds?: number;
  size?: number;
  usage?: {
    ops: number;
    since: Date;
  };
}

// Collection statistics
export interface CollectionStats {
  name: string;
  count: number;
  size: number;
  avgObjSize: number;
  storageSize: number;
  indexes: number;
  totalIndexSize: number;
  indexSizes: { [indexName: string]: number };
  capped?: boolean;
  maxSize?: number;
  maxDocuments?: number;
}

// Query execution plan
export interface QueryExecutionPlan {
  queryPlanner: {
    plannerVersion: number;
    namespace: string;
    indexFilterSet: boolean;
    parsedQuery: any;
    winningPlan: any;
    rejectedPlans: any[];
  };
  executionStats?: {
    totalDocsExamined: number;
    totalDocsReturned: number;
    executionTimeMillis: number;
    totalKeysExamined: number;
    isMultiKey: boolean;
    multiKeyPaths: any;
    stage: string;
  };
}

// Database operation result
export interface DatabaseOperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  duration: number;
  operation: string;
  collection?: string;
  affectedRecords?: number;
}

// Collection validation result
export interface CollectionValidationResult {
  collection: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
  repaired?: boolean;
  ns: string;
  nrecords: number;
  nIndexes: number;
  keysPerIndex: { [indexName: string]: number };
}

// Database backup configuration
export interface BackupConfig {
  enabled: boolean;
  schedule?: string; // Cron expression
  destination: string;
  compression?: boolean;
  encryption?: {
    enabled: boolean;
    key?: string;
    algorithm?: string;
  };
  retention?: {
    days?: number;
    count?: number;
  };
  collections?: string[]; // Specific collections to backup
  excludeCollections?: string[];
}

// Backup result
export interface BackupResult {
  success: boolean;
  backupId: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  size: number;
  collections: string[];
  location: string;
  error?: string;
}

// Restore options
export interface RestoreOptions {
  backupId?: string;
  backupPath?: string;
  collections?: string[];
  excludeCollections?: string[];
  dropExisting?: boolean;
  dryRun?: boolean;
}

// Restore result
export interface RestoreResult {
  success: boolean;
  restoreId: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  collections: string[];
  documentsRestored: number;
  indexesRestored: number;
  error?: string;
}

// Migration configuration
export interface MigrationConfig {
  version: string;
  description: string;
  up: () => Promise<void>;
  down: () => Promise<void>;
  dependencies?: string[];
}

// Migration status
export interface MigrationStatus {
  version: string;
  applied: boolean;
  appliedAt?: Date;
  error?: string;
  duration?: number;
}

// Database event types
export type DatabaseEventType = 
  | 'connected'
  | 'disconnected'
  | 'reconnected'
  | 'error'
  | 'timeout'
  | 'close'
  | 'serverOpening'
  | 'serverClosed'
  | 'topologyOpening'
  | 'topologyClosed'
  | 'topologyDescriptionChanged';

// Database event data
export interface DatabaseEventData {
  type: DatabaseEventType;
  timestamp: Date;
  message?: string;
  error?: Error;
  data?: any;
  connectionId?: string;
}

// Database event listener
export type DatabaseEventListener = (event: DatabaseEventData) => void;

// Connection pool events
export interface ConnectionPoolEvents {
  connectionPoolCreated: (event: any) => void;
  connectionPoolClosed: (event: any) => void;
  connectionCreated: (event: any) => void;
  connectionReady: (event: any) => void;
  connectionClosed: (event: any) => void;
  connectionCheckOutStarted: (event: any) => void;
  connectionCheckOutFailed: (event: any) => void;
  connectionCheckedOut: (event: any) => void;
  connectionCheckedIn: (event: any) => void;
  connectionPoolCleared: (event: any) => void;
}

// Query monitoring
export interface QueryMonitoring {
  enabled: boolean;
  slowQueryThreshold?: number; // milliseconds
  logQueries?: boolean;
  logSlowQueries?: boolean;
  maxLogSize?: number;
  aggregateStats?: boolean;
}

// Slow query log entry
export interface SlowQueryLogEntry {
  timestamp: Date;
  duration: number;
  collection: string;
  operation: string;
  query: any;
  projection?: any;
  sort?: any;
  limit?: number;
  skip?: number;
  executionStats?: any;
}

// Database security configuration
export interface DatabaseSecurity {
  authentication: {
    enabled: boolean;
    mechanism?: string;
    source?: string;
  };
  authorization: {
    enabled: boolean;
    roles?: string[];
  };
  encryption: {
    enabled: boolean;
    inTransit?: boolean;
    atRest?: boolean;
  };
  auditing: {
    enabled: boolean;
    filter?: any;
    format?: 'JSON' | 'BSON';
  };
}

// Database manager state
export interface DatabaseManagerState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error' | 'closed';
  client?: MongoClient;
  database?: Db;
  connectionState: ConnectionState;
  metrics?: DatabaseMetrics;
  lastHealthCheck?: DatabaseHealthCheck;
  eventListeners: Map<DatabaseEventType, DatabaseEventListener[]>;
  activeTransactions: Set<ClientSession>;
  slowQueries: SlowQueryLogEntry[];
}

// Aggregation options (used in aggregate method)
export interface AggregationOptions {
  maxTimeMS?: number;
  allowDiskUse?: boolean;
  cursor?: {
    batchSize?: number;
  };
  hint?: string | { [field: string]: 1 | -1 };
  session?: ClientSession;
  readPreference?: string;
  readConcern?: {
    level: string;
  };
  collation?: {
    locale: string;
    [key: string]: any;
  };
  [key: string]: any;
}

// Bulk write options (used in bulkWrite method)
export interface BulkWriteOptions {
  ordered?: boolean;
  session?: ClientSession;
  writeConcern?: {
    w?: number | 'majority';
    j?: boolean;
    wtimeout?: number;
  };
  bypassDocumentValidation?: boolean;
}

// Database schema map type (used in initializeCollections)
export type DatabaseSchemaMap = Map<string, {
  indexes?: IndexDefinition[];
  [key: string]: any;
}>;

// Connection event handler types
export interface DatabaseEventHandlers {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
  onReconnected?: () => void;
  onTimeout?: () => void;
  onServerOpening?: () => void;
  onServerClosed?: () => void;
}

// Default configurations
export const DEFAULT_DATABASE_OPTIONS: Required<Omit<DatabaseManagerOptions, 'config'>> = {
  enableHealthCheck: true,
  healthCheckInterval: 30000, // 30 seconds
  enableMetrics: true,
  metricsInterval: 60000, // 1 minute
  enableConnectionPooling: true,
  maxRetries: 3,
  retryDelayMs: 1000,
  enableLogging: true,
  logLevel: 'info'
};

export const DEFAULT_CONNECTION_OPTIONS: Required<DatabaseConnectionOptions> = {
  maxPoolSize: 10,
  minPoolSize: 5,
  maxIdleTimeMS: 30000,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 30000,
  heartbeatFrequencyMS: 10000,
  retryWrites: true,
  retryReads: true,
  readPreference: 'primary',
  readConcern: { level: 'local' },
  writeConcern: { w: 'majority', j: true },
  compression: ['snappy'],
  ssl: false,
  sslValidate: true,
  authSource: 'admin',
  authMechanism: 'SCRAM-SHA-256',
  directConnection: false,
  replicaSet: '',
  family: 4
};

export const DEFAULT_TRANSACTION_OPTIONS: Required<TransactionOptions> = {
  readPreference: 'primary',
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority', j: true },
  maxCommitTimeMS: 60000
};

export const DEFAULT_QUERY_MONITORING: Required<QueryMonitoring> = {
  enabled: true,
  slowQueryThreshold: 1000, // 1 second
  logQueries: false,
  logSlowQueries: true,
  maxLogSize: 1000,
  aggregateStats: true
};

export const DEFAULT_BACKUP_CONFIG: Required<BackupConfig> = {
  enabled: false,
  schedule: '0 2 * * *', // Daily at 2 AM
  destination: './backups',
  compression: true,
  encryption: {
    enabled: false,
    algorithm: 'aes-256-gcm'
  },
  retention: {
    days: 30,
    count: 10
  },
  collections: [],
  excludeCollections: []
};

export const DEFAULT_FIND_OPTIONS: Partial<FindOptions> = {
  page: 1,
  limit: 50,
  sort: {},
  projection: {}
};

export const DEFAULT_AGGREGATION_OPTIONS: AggregationOptions = {
  maxTimeMS: 30000,
  allowDiskUse: false
};

export const DEFAULT_BULK_WRITE_OPTIONS: BulkWriteOptions = {
  ordered: false
};

// Export utility types
export type DatabaseClient = MongoClient;
export type Database = Db;
export type DatabaseCollection<T extends Document = any> = Collection<T>;
export type DatabaseSession = ClientSession;

// Error types
export class DatabaseConnectionError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'DatabaseConnectionError';
  }
}

export class DatabaseOperationError extends Error {
  constructor(
    message: string, 
    public operation: string,
    public collection?: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'DatabaseOperationError';
  }
}

export class DatabaseTransactionError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'DatabaseTransactionError';
  }
}

export class DatabaseValidationError extends Error {
  constructor(message: string, public errors: string[]) {
    super(message);
    this.name = 'DatabaseValidationError';
  }
}

// Re-export for backwards compatibility
export {
  type DatabaseConfig as DbConfig,
  type DatabaseManagerOptions as DbManagerOptions,
  type ConnectionState as DbConnectionState,
  type DatabaseMetrics as DbMetrics,
  type TransactionCallback as DbTransactionCallback,
  type HealthCheckResult as DbHealthCheckResult,
  type PaginationResult as DbPaginationResult,
  type FindOptions as DbFindOptions,
  type IndexDefinition as DbIndexDefinition,
  type CollectionInfo as DbCollectionInfo,
  type DatabaseStats as DbStats
};