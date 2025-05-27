// Utility functions for MongoREST
const { ObjectId } = require('mongodb');

class Utils {
  // Object ID utilities
  static isValidObjectId(id) {
    return ObjectId.isValid(id);
  }

  static createObjectId(id) {
    if (id && this.isValidObjectId(id)) {
      return new ObjectId(id);
    }
    return new ObjectId();
  }

  static objectIdToString(objectId) {
    return objectId instanceof ObjectId ? objectId.toString() : objectId;
  }

  // Date utilities
  static formatDate(date, format = 'iso') {
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

  static parseDate(dateString) {
    if (!dateString) return null;

    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  }

  static addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  static diffInDays(date1, date2) {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.round(Math.abs((date1 - date2) / oneDay));
  }

  // String utilities
  static slugify(text) {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-') // Replace spaces with -
      .replace(/[^\w\-]+/g, '') // Remove all non-word chars
      .replace(/\-\-+/g, '-') // Replace multiple - with single -
      .replace(/^-+/, '') // Trim - from start of text
      .replace(/-+$/, ''); // Trim - from end of text
  }

  static camelCase(str) {
    return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
  }

  static kebabCase(str) {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase();
  }

  static capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  static truncate(str, length = 100, suffix = '...') {
    if (str.length <= length) return str;
    return str.substring(0, length) + suffix;
  }

  // Validation utilities
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  static isValidPhoneNumber(phone) {
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
    return phoneRegex.test(phone);
  }

  static sanitizeInput(input) {
    if (typeof input !== 'string') return input;

    return input
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .trim();
  }

  // Array utilities
  static uniqueBy(array, key) {
    const seen = new Set();
    return array.filter(item => {
      const value = typeof key === 'function' ? key(item) : item[key];
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
  }

  static groupBy(array, key) {
    return array.reduce((groups, item) => {
      const value = typeof key === 'function' ? key(item) : item[key];
      groups[value] = groups[value] || [];
      groups[value].push(item);
      return groups;
    }, {});
  }

  static sortBy(array, key, order = 'asc') {
    return array.sort((a, b) => {
      const aVal = typeof key === 'function' ? key(a) : a[key];
      const bVal = typeof key === 'function' ? key(b) : b[key];

      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    });
  }

  static chunk(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  // Object utilities
  static deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  static deepMerge(target, source) {
    const output = { ...target };

    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }

    return output;
  }

  static isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  static pick(obj, keys) {
    const picked = {};
    keys.forEach(key => {
      if (key in obj) {
        picked[key] = obj[key];
      }
    });
    return picked;
  }

  static omit(obj, keys) {
    const omitted = { ...obj };
    keys.forEach(key => {
      delete omitted[key];
    });
    return omitted;
  }

  static getValueByPath(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  static setValueByPath(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();

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
  static formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  static formatNumber(num, locale = 'en-US') {
    return new Intl.NumberFormat(locale).format(num);
  }

  static formatCurrency(amount, currency = 'USD', locale = 'en-US') {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency
    }).format(amount);
  }

  static formatPercentage(value, decimals = 2) {
    return `${(value * 100).toFixed(decimals)}%`;
  }

  // Error utilities
  static createError(message, code = 'GENERIC_ERROR', statusCode = 500, details = {}) {
    const error = new Error(message);
    error.code = code;
    error.statusCode = statusCode;
    error.details = details;
    return error;
  }

  static isMongoError(error) {
    return error.name && (
      error.name.includes('Mongo')
      || error.name === 'BulkWriteError'
      || error.code === 11000 // Duplicate key error
    );
  }

  static getMongoErrorType(error) {
    if (error.code === 11000) return 'DUPLICATE_KEY';
    if (error.name === 'ValidationError') return 'VALIDATION_ERROR';
    if (error.name === 'CastError') return 'CAST_ERROR';
    if (error.codeName === 'Unauthorized') return 'UNAUTHORIZED';
    return 'MONGO_ERROR';
  }

  // Async utilities
  static async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static async retry(fn, maxRetries = 3, delay = 1000) {
    let lastError;

    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (i === maxRetries) {
          throw error;
        }

        await this.sleep(delay * Math.pow(2, i)); // Exponential backoff
      }
    }

    throw lastError;
  }

  static async timeout(promise, ms) {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Operation timed out')), ms)
    );

    return Promise.race([promise, timeoutPromise]);
  }

  // Query building utilities
  static buildMongoQuery(filters) {
    const query = {};

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

  static buildSortQuery(sort, order = 'asc') {
    if (!sort) return {};

    if (typeof sort === 'string') {
      return { [sort]: order === 'desc' ? -1 : 1 };
    }

    if (Array.isArray(sort)) {
      const sortObj = {};
      sort.forEach(field => {
        sortObj[field] = order === 'desc' ? -1 : 1;
      });
      return sortObj;
    }

    return sort;
  }

  static buildProjection(fields) {
    if (!fields) return {};

    if (typeof fields === 'string') {
      const projection = {};
      fields.split(',').forEach(field => {
        projection[field.trim()] = 1;
      });
      return projection;
    }

    if (Array.isArray(fields)) {
      const projection = {};
      fields.forEach(field => {
        projection[field] = 1;
      });
      return projection;
    }

    return fields;
  }

  // Security utilities
  static generateRandomString(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  static hashString(str) {
    let hash = 0;
    if (str.length === 0) return hash;

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return hash;
  }

  static maskEmail(email) {
    const [username, domain] = email.split('@');
    if (username.length <= 2) return email;

    const maskedUsername = username[0] + '*'.repeat(username.length - 2) + username[username.length - 1];
    return `${maskedUsername}@${domain}`;
  }

  // Development utilities
  static isDevelopment() {
    return process.env.NODE_ENV === 'development';
  }

  static isProduction() {
    return process.env.NODE_ENV === 'production';
  }

  static debugLog(...args) {
    if (this.isDevelopment()) {
      console.log('[DEBUG]', ...args);
    }
  }

  static measureTime(fn, label = 'Operation') {
    const start = Date.now();
    const result = fn();
    const end = Date.now();

    console.log(`${label} took ${end - start}ms`);
    return result;
  }

  static async measureTimeAsync(fn, label = 'Async Operation') {
    const start = Date.now();
    const result = await fn();
    const end = Date.now();

    console.log(`${label} took ${end - start}ms`);
    return result;
  }
}

module.exports = Utils;
