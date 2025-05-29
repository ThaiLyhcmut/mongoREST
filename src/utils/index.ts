// TypeScript utility functions for MongoREST
import { ObjectId } from 'mongodb';

// Type definitions for utility functions
export interface DateFormatOptions {
  format?: 'iso' | 'date' | 'time' | 'timestamp';
}

export interface ChunkOptions {
  size: number;
}

export interface RetryOptions {
  maxRetries?: number;
  delay?: number;
}

export interface ErrorDetails {
  [key: string]: any;
}

export interface CustomError extends Error {
  code: string;
  statusCode: number;
  details: ErrorDetails;
}

export interface MongoQueryFilters {
  [key: string]: any;
}

export interface SortOptions {
  [key: string]: 1 | -1;
}

export interface ProjectionOptions {
  [key: string]: 0 | 1;
}

class Utils {
  // Object ID utilities
  static isValidObjectId(id: string | ObjectId): boolean {
    return ObjectId.isValid(id);
  }

  static createObjectId(id?: string | ObjectId): ObjectId {
    if (id && this.isValidObjectId(id)) {
      return new ObjectId(id);
    }
    return new ObjectId();
  }

  static objectIdToString(objectId: ObjectId | string): string {
    return objectId instanceof ObjectId ? objectId.toString() : objectId;
  }

  // Date utilities
  static formatDate(date: Date | string | number, format: 'iso' | 'date' | 'time' | 'timestamp' = 'iso'): string | number | null {
    if (!date) return null;
    
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;

    switch (format) {
      case 'iso':
        return d.toISOString();
      case 'date':
        return d.toISOString().split('T')[0];
      case 'time':
        return d.toISOString().split('T')[1].split('.')[0];
      case 'timestamp':
        return d.getTime();
      default:
        return d.toISOString();
    }
  }

  static parseDate(dateString: string): Date | null {
    if (!dateString) return null;
    
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  }

  static addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  static diffInDays(date1: Date, date2: Date): number {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.round(Math.abs((date1.getTime() - date2.getTime()) / oneDay));
  }

  // String utilities
  static slugify(text: string): string {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')           // Replace spaces with -
      .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
      .replace(/\-\-+/g, '-')         // Replace multiple - with single -
      .replace(/^-+/, '')             // Trim - from start of text
      .replace(/-+$/, '');            // Trim - from end of text
  }

  static camelCase(str: string): string {
    return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
  }

  static kebabCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase();
  }

  static capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  static truncate(str: string, length: number = 100, suffix: string = '...'): string {
    if (str.length <= length) return str;
    return str.substring(0, length) + suffix;
  }

  // Validation utilities
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  static isValidPhoneNumber(phone: string): boolean {
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
    return phoneRegex.test(phone);
  }

  static sanitizeInput(input: any): any {
    if (typeof input !== 'string') return input;
    
    return input
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .trim();
  }

  // Array utilities
  static uniqueBy<T>(array: T[], key: string | ((item: T) => any)): T[] {
    const seen = new Set();
    return array.filter(item => {
      const value = typeof key === 'function' ? key(item) : (item as any)[key];
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
  }

  static groupBy<T>(array: T[], key: string | ((item: T) => string)): Record<string, T[]> {
    return array.reduce((groups: Record<string, T[]>, item) => {
      const value = typeof key === 'function' ? key(item) : (item as any)[key];
      groups[value] = groups[value] || [];
      groups[value].push(item);
      return groups;
    }, {});
  }

  static sortBy<T>(array: T[], key: string | ((item: T) => any), order: 'asc' | 'desc' = 'asc'): T[] {
    return array.sort((a, b) => {
      const aVal = typeof key === 'function' ? key(a) : (a as any)[key];
      const bVal = typeof key === 'function' ? key(b) : (b as any)[key];
      
      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    });
  }

  static chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  // Object utilities
  static deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  static deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
    const output = { ...target };
    
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            (output as any)[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    
    return output;
  }

  static isObject(item: any): item is Record<string, any> {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  static pick<T extends Record<string, any>, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
    const picked = {} as Pick<T, K>;
    keys.forEach(key => {
      if (key in obj) {
        picked[key] = obj[key];
      }
    });
    return picked;
  }

  static omit<T extends Record<string, any>, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
    const omitted = { ...obj };
    keys.forEach(key => {
      delete omitted[key];
    });
    return omitted as Omit<T, K>;
  }

  static getValueByPath(obj: Record<string, any>, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  static setValueByPath(obj: Record<string, any>, path: string, value: any): Record<string, any> {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    
    const target = keys.reduce((current, key) => {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      return current[key];
    }, obj);
    
    target[lastKey] = value;
    return obj;
  }

  // Format utilities
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static formatNumber(num: number, locale: string = 'en-US'): string {
    return new Intl.NumberFormat(locale).format(num);
  }

  static formatCurrency(amount: number, currency: string = 'USD', locale: string = 'en-US'): string {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency
    }).format(amount);
  }

  static formatPercentage(value: number, decimals: number = 2): string {
    return (value * 100).toFixed(decimals) + '%';
  }

  // Error utilities
  static createError(message: string, code: string = 'GENERIC_ERROR', statusCode: number = 500, details: ErrorDetails = {}): CustomError {
    const error = new Error(message) as CustomError;
    error.code = code;
    error.statusCode = statusCode;
    error.details = details;
    return error;
  }

  static isMongoError(error: Error): boolean {
    return (
      typeof error.name === 'string' &&
      (
        error.name.includes('Mongo') || 
        error.name === 'BulkWriteError' ||
        (error as any).code === 11000 // Duplicate key error
      )
    );
  }

  static getMongoErrorType(error: any): string {
    if (error.code === 11000) return 'DUPLICATE_KEY';
    if (error.name === 'ValidationError') return 'VALIDATION_ERROR';
    if (error.name === 'CastError') return 'CAST_ERROR';
    if (error.codeName === 'Unauthorized') return 'UNAUTHORIZED';
    return 'MONGO_ERROR';
  }

  // Async utilities
  static async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static async retry<T>(fn: () => Promise<T>, maxRetries: number = 3, delay: number = 1000): Promise<T> {
    let lastError: Error;
    
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (i === maxRetries) {
          throw error;
        }
        
        await this.sleep(delay * Math.pow(2, i)); // Exponential backoff
      }
    }
    
    throw lastError!;
  }

  static async timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Operation timed out')), ms)
    );
    
    return Promise.race([promise, timeoutPromise]);
  }

  // Query building utilities
  static buildMongoQuery(filters: MongoQueryFilters): Record<string, any> {
    const query: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null) continue;
      
      if (key.includes('.')) {
        // Nested field query
        query[key] = value;
      } else if (Array.isArray(value)) {
        // Array values become $in query
        query[key] = { $in: value };
      } else if (typeof value === 'object' && value.constructor === Object) {
        // Object values are passed through (for operators like $gte, $lt, etc.)
        query[key] = value;
      } else {
        // Simple equality
        query[key] = value;
      }
    }
    
    return query;
  }

  static buildSortQuery(sort: string | string[] | SortOptions, order: 'asc' | 'desc' = 'asc'): SortOptions {
    if (!sort) return {};
    
    if (typeof sort === 'string') {
      return { [sort]: order === 'desc' ? -1 : 1 };
    }
    
    if (Array.isArray(sort)) {
      const sortObj: SortOptions = {};
      sort.forEach(field => {
        sortObj[field] = order === 'desc' ? -1 : 1;
      });
      return sortObj;
    }
    
    return sort;
  }

  static buildProjection(fields: string | string[] | ProjectionOptions): ProjectionOptions {
    if (!fields) return {};
    
    if (typeof fields === 'string') {
      const projection: ProjectionOptions = {};
      fields.split(',').forEach(field => {
        projection[field.trim()] = 1;
      });
      return projection;
    }
    
    if (Array.isArray(fields)) {
      const projection: ProjectionOptions = {};
      fields.forEach(field => {
        projection[field] = 1;
      });
      return projection;
    }
    
    return fields;
  }

  // Security utilities
  static generateRandomString(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  static hashString(str: string): number {
    let hash = 0;
    if (str.length === 0) return hash;
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return hash;
  }

  static maskEmail(email: string): string {
    const [username, domain] = email.split('@');
    if (username.length <= 2) return email;
    
    const maskedUsername = username[0] + '*'.repeat(username.length - 2) + username[username.length - 1];
    return `${maskedUsername}@${domain}`;
  }

  // Development utilities
  static isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development';
  }

  static isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  static debugLog(...args: any[]): void {
    if (this.isDevelopment()) {
      console.log('[DEBUG]', ...args);
    }
  }

  static measureTime<T>(fn: () => T, label: string = 'Operation'): T {
    const start = Date.now();
    const result = fn();
    const end = Date.now();
    
    console.log(`${label} took ${end - start}ms`);
    return result;
  }

  static async measureTimeAsync<T>(fn: () => Promise<T>, label: string = 'Async Operation'): Promise<T> {
    const start = Date.now();
    const result = await fn();
    const end = Date.now();
    
    console.log(`${label} took ${end - start}ms`);
    return result;
  }
}

export default Utils;
