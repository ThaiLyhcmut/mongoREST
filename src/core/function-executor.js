import { ObjectId } from 'mongodb';

class FunctionExecutor {
  constructor(schemaLoader, dbManager) {
    this.schemaLoader = schemaLoader;
    this.dbManager = dbManager;
    this.functions = schemaLoader.functions;
    this.stepExecutors = new Map();
    this.transformScripts = new Map();
    this.initializeStepExecutors();
    this.initializeTransformScripts();
  }

  // Initialize step executors for different operation types
  initializeStepExecutors() {
    // MongoDB operations
    this.stepExecutors.set('find', this.executeFindStep.bind(this));
    this.stepExecutors.set('findOne', this.executeFindOneStep.bind(this));
    this.stepExecutors.set('insertOne', this.executeInsertOneStep.bind(this));
    this.stepExecutors.set('insertMany', this.executeInsertManyStep.bind(this));
    this.stepExecutors.set('updateOne', this.executeUpdateOneStep.bind(this));
    this.stepExecutors.set('updateMany', this.executeUpdateManyStep.bind(this));
    this.stepExecutors.set('deleteOne', this.executeDeleteOneStep.bind(this));
    this.stepExecutors.set('deleteMany', this.executeDeleteManyStep.bind(this));
    this.stepExecutors.set('aggregate', this.executeAggregateStep.bind(this));
    this.stepExecutors.set('countDocuments', this.executeCountStep.bind(this));
    this.stepExecutors.set('distinct', this.executeDistinctStep.bind(this));

    // Utility operations
    this.stepExecutors.set('transform', this.executeTransformStep.bind(this));
    this.stepExecutors.set('condition', this.executeConditionStep.bind(this));
    this.stepExecutors.set('http', this.executeHttpStep.bind(this));
    this.stepExecutors.set('delay', this.executeDelayStep.bind(this));
  }

  // Initialize transform scripts
  initializeTransformScripts() {
    // Example transform scripts - these would typically be loaded from files or config
    this.transformScripts.set('processUserReportData', this.processUserReportData.bind(this));
    this.transformScripts.set('mergeUserOrderData', this.mergeUserOrderData.bind(this));
    this.transformScripts.set('userToCRMFormat', this.userToCRMFormat.bind(this));
  }

  // Main function execution method
  async executeFunction(functionName, params, context) {
    const startTime = Date.now();
    
    try {
      const functionDef = this.functions.get(functionName);
      if (!functionDef) {
        throw new Error(`Function '${functionName}' not found`);
      }

      console.log(`🚀 Executing function: ${functionName}`);

      // Validate input parameters
      this.validateFunctionInput(functionDef, params);

      // Execute pre-execution hooks
      await this.executeHooks(functionDef.hooks?.beforeExecution, functionName, { params, context });

      // Initialize execution context
      const executionContext = {
        functionName,
        params,
        steps: new Map(),
        output: null,
        user: context.user,
        config: context.config || {},
        now: new Date().toISOString(),
        startTime,
        errors: []
      };

      try {
        // Execute steps in sequence
        for (const step of functionDef.steps) {
          console.log(`  🔧 Executing step: ${step.id} (${step.type})`);
          
          const stepStartTime = Date.now();
          const result = await this.executeStep(step, executionContext);
          const stepExecutionTime = Date.now() - stepStartTime;
          
          executionContext.steps.set(step.id, {
            output: result,
            executionTime: stepExecutionTime,
            timestamp: new Date().toISOString()
          });

          console.log(`    ✅ Step ${step.id} completed in ${stepExecutionTime}ms`);
        }

        // Format final output
        executionContext.output = this.formatOutput(functionDef, executionContext);

        // Execute post-execution hooks
        await this.executeHooks(functionDef.hooks?.afterExecution, functionName, executionContext);

        const totalExecutionTime = Date.now() - startTime;
        
        console.log(`✅ Function ${functionName} completed in ${totalExecutionTime}ms`);

        return {
          success: true,
          function: functionName,
          result: executionContext.output,
          meta: {
            executionTime: `${totalExecutionTime}ms`,
            stepsExecuted: functionDef.steps.length,
            timestamp: new Date().toISOString()
          }
        };

      } catch (error) {
        // Execute error hooks
        if (functionDef.hooks?.onError) {
          await this.executeHooks(functionDef.hooks.onError, functionName, { 
            ...executionContext, 
            error 
          });
        }

        // Handle error based on error handling strategy
        if (functionDef.errorHandling) {
          await this.handleFunctionError(error, functionDef, executionContext);
        }

        throw error;
      }

    } catch (error) {
      const totalExecutionTime = Date.now() - startTime;
      
      console.error(`❌ Function ${functionName} failed after ${totalExecutionTime}ms:`, error);

      return {
        success: false,
        function: functionName,
        error: error.message,
        meta: {
          executionTime: `${totalExecutionTime}ms`,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  // Execute individual step
  async executeStep(step, context) {
    const executor = this.stepExecutors.get(step.type);
    if (!executor) {
      throw new Error(`Unknown step type: ${step.type}`);
    }

    // Resolve template variables in step configuration
    const resolvedStep = this.resolveTemplates(step, context);
    
    // Add step timeout
    const timeout = parseInt(process.env.FUNCTION_TIMEOUT) || 30000;
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Step ${step.id} timed out after ${timeout}ms`)), timeout)
    );

    // Execute step with timeout
    const stepPromise = executor(resolvedStep, context);
    
    return await Promise.race([stepPromise, timeoutPromise]);
  }

  // Resolve template variables in object
  resolveTemplates(obj, context) {
    const resolved = JSON.parse(JSON.stringify(obj));
    
    this.replaceTemplatesRecursive(resolved, context);
    
    return resolved;
  }

  // Recursively replace template variables
  replaceTemplatesRecursive(obj, context) {
    if (typeof obj === 'string') {
      return this.replaceTemplateString(obj, context);
    }
    
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        obj[i] = this.replaceTemplatesRecursive(obj[i], context);
      }
    } else if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        obj[key] = this.replaceTemplatesRecursive(value, context);
      }
    }
    
    return obj;
  }

  // Replace template variables in string
  replaceTemplateString(str, context) {
    const templateRegex = /\{\{([^}]+)\}\}/g;
    
    return str.replace(templateRegex, (match, path) => {
      try {
        const value = this.getValueByPath(context, path.trim());
        return value !== undefined ? value : match;
      } catch (error) {
        console.warn(`Template resolution failed for ${path}:`, error.message);
        return match;
      }
    });
  }

  // Get value by dot notation path
  getValueByPath(obj, path) {
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (current === null || current === undefined) {
        return undefined;
      }
      
      // Handle array access with brackets
      const arrayMatch = key.match(/^(.+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, arrayKey, index] = arrayMatch;
        current = current[arrayKey];
        if (Array.isArray(current)) {
          current = current[parseInt(index)];
        }
      } else {
        current = current[key];
      }
    }
    
    return current;
  }

  // MongoDB Step Executors
  async executeFindStep(step, context) {
    const collection = this.dbManager.collection(step.collection);
    const query = step.query || {};
    const options = step.options || {};
    
    const result = await collection.find(query, options).toArray();
    return result;
  }

  async executeFindOneStep(step, context) {
    const collection = this.dbManager.collection(step.collection);
    const query = step.query || {};
    const options = step.options || {};
    
    const result = await collection.findOne(query, options);
    return result;
  }

  async executeInsertOneStep(step, context) {
    const collection = this.dbManager.collection(step.collection);
    const document = step.document;
    
    // Add timestamps
    const now = new Date().toISOString();
    document.createdAt = document.createdAt || now;
    document.updatedAt = now;
    
    const result = await collection.insertOne(document);
    return {
      insertedId: result.insertedId,
      acknowledged: result.acknowledged,
      document: { ...document, _id: result.insertedId }
    };
  }

  async executeInsertManyStep(step, context) {
    const collection = this.dbManager.collection(step.collection);
    const documents = step.documents;
    
    // Add timestamps to all documents
    const now = new Date().toISOString();
    documents.forEach(doc => {
      doc.createdAt = doc.createdAt || now;
      doc.updatedAt = now;
    });
    
    const result = await collection.insertMany(documents);
    return {
      insertedIds: result.insertedIds,
      insertedCount: result.insertedCount,
      acknowledged: result.acknowledged
    };
  }

  async executeUpdateOneStep(step, context) {
    const collection = this.dbManager.collection(step.collection);
    const filter = step.filter || {};
    const update = step.update || {};
    const options = step.options || {};
    
    // Add updated timestamp
    if (update.$set) {
      update.$set.updatedAt = new Date().toISOString();
    } else {
      update.$set = { updatedAt: new Date().toISOString() };
    }
    
    const result = await collection.updateOne(filter, update, options);
    return {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      acknowledged: result.acknowledged
    };
  }

  async executeUpdateManyStep(step, context) {
    const collection = this.dbManager.collection(step.collection);
    const filter = step.filter || {};
    const update = step.update || {};
    const options = step.options || {};
    
    // Add updated timestamp
    if (update.$set) {
      update.$set.updatedAt = new Date().toISOString();
    } else {
      update.$set = { updatedAt: new Date().toISOString() };
    }
    
    const result = await collection.updateMany(filter, update, options);
    return {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      acknowledged: result.acknowledged
    };
  }

  async executeDeleteOneStep(step, context) {
    const collection = this.dbManager.collection(step.collection);
    const filter = step.filter || {};
    
    const result = await collection.deleteOne(filter);
    return {
      deletedCount: result.deletedCount,
      acknowledged: result.acknowledged
    };
  }

  async executeDeleteManyStep(step, context) {
    const collection = this.dbManager.collection(step.collection);
    const filter = step.filter || {};
    
    const result = await collection.deleteMany(filter);
    return {
      deletedCount: result.deletedCount,
      acknowledged: result.acknowledged
    };
  }

  async executeAggregateStep(step, context) {
    const collection = this.dbManager.collection(step.collection);
    const pipeline = step.pipeline || [];
    const options = step.options || {};
    
    const result = await collection.aggregate(pipeline, options).toArray();
    return result;
  }

  async executeCountStep(step, context) {
    const collection = this.dbManager.collection(step.collection);
    const query = step.query || {};
    
    const count = await collection.countDocuments(query);
    return count;
  }

  async executeDistinctStep(step, context) {
    const collection = this.dbManager.collection(step.collection);
    const field = step.field;
    const query = step.query || {};
    
    const result = await collection.distinct(field, query);
    return result;
  }

  // Utility Step Executors
  async executeTransformStep(step, context) {
    const scriptName = step.script;
    const input = step.input || {};
    
    const script = this.transformScripts.get(scriptName);
    if (!script) {
      throw new Error(`Transform script '${scriptName}' not found`);
    }
    
    return await script(input, context);
  }

  async executeConditionStep(step, context) {
    const condition = step.condition;
    const thenSteps = step.then || [];
    const elseSteps = step.else || [];
    
    // Evaluate condition (simple implementation)
    const conditionResult = this.evaluateCondition(condition, context);
    const stepsToExecute = conditionResult ? thenSteps : elseSteps;
    
    const results = [];
    for (const subStep of stepsToExecute) {
      const result = await this.executeStep(subStep, context);
      results.push(result);
    }
    
    return {
      condition: conditionResult,
      results
    };
  }

  async executeHttpStep(step, context) {
    const { method = 'GET', url, headers = {}, body, timeout = 10000 } = step;
    
    // Simple HTTP request implementation (in production, use a proper HTTP client)
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: body ? JSON.stringify(body) : undefined,
        timeout
      });
      
      const data = await response.json();
      
      return {
        status: response.status,
        success: response.ok,
        data,
        headers: Object.fromEntries(response.headers.entries())
      };
    } catch (error) {
      throw new Error(`HTTP request failed: ${error.message}`);
    }
  }

  async executeDelayStep(step, context) {
    const duration = step.duration || 1000;
    
    await new Promise(resolve => setTimeout(resolve, duration));
    
    return {
      delayed: duration,
      timestamp: new Date().toISOString()
    };
  }

  // Transform Scripts
  async processUserReportData(input, context) {
    const { userStats, newUsers, activeUsers, segments } = input;
    
    const processed = {
      summary: {
        totalUsers: userStats[0]?.totalUsers || 0,
        activeUsers: activeUsers[0]?.activeUsers || 0,
        newUsers: newUsers.length
      },
      segments: [],
      trends: {
        daily: newUsers,
        weekly: [],
        monthly: []
      }
    };

    // Process segments
    if (segments.includes('country') && userStats[0]?.byCountry) {
      processed.segments.push({
        type: 'country',
        data: userStats[0].byCountry
      });
    }

    return processed;
  }

  async mergeUserOrderData(input, context) {
    const { userStats, orderStats } = input;
    
    // Simple merge implementation
    const merged = userStats.map(user => {
      const userOrders = orderStats.find(order => order._id === user._id) || {};
      return {
        ...user,
        orderCount: userOrders.orderCount || 0,
        totalAmount: userOrders.totalAmount || 0
      };
    });

    return merged;
  }

  async userToCRMFormat(input, context) {
    if (!Array.isArray(input)) {
      input = [input];
    }

    return input.map(user => ({
      external_id: user._id,
      email: user.email,
      full_name: user.name,
      country_code: this.getCountryCode(user.profile?.country),
      last_updated: user.updatedAt
    }));
  }

  // Helper methods
  getCountryCode(country) {
    const countryMap = {
      'Vietnam': 'VN',
      'Thailand': 'TH',
      'Malaysia': 'MY',
      'Singapore': 'SG',
      'Indonesia': 'ID',
      'Philippines': 'PH'
    };
    return countryMap[country] || 'Unknown';
  }

  evaluateCondition(condition, context) {
    // Simple condition evaluation - in production, use a proper expression evaluator
    try {
      // This is a simplified implementation - should use a safe evaluator
      const expression = this.replaceTemplateString(condition, context);
      return Boolean(eval(expression));
    } catch (error) {
      console.warn('Condition evaluation failed:', error);
      return false;
    }
  }

  // Validation and utility methods
  validateFunctionInput(functionDef, params) {
    if (functionDef.input) {
      const validation = this.schemaLoader.validateFunctionInput(functionDef.name, params);
      if (!validation.valid) {
        throw new Error(`Invalid function input: ${JSON.stringify(validation.errors)}`);
      }
    }
  }

  formatOutput(functionDef, context) {
    if (functionDef.output) {
      // If output schema is defined, format according to schema
      const lastStep = context.steps.get(functionDef.steps[functionDef.steps.length - 1].id);
      return lastStep?.output;
    }
    
    // Default: return all step outputs
    const outputs = {};
    for (const [stepId, stepResult] of context.steps) {
      outputs[stepId] = stepResult.output;
    }
    return outputs;
  }

  async executeHooks(hooks, functionName, context) {
    if (!hooks || !Array.isArray(hooks)) {
      return;
    }

    for (const hook of hooks) {
      try {
        await this.executeHook(hook, functionName, context);
      } catch (error) {
        console.error(`Hook '${hook}' failed for function '${functionName}':`, error);
      }
    }
  }

  async executeHook(hookName, functionName, context) {
    console.log(`🪝 Executing function hook: ${hookName}`);
    
    // Example hook implementations
    switch (hookName) {
      case 'validateDateRange':
        if (context.params?.dateRange) {
          const { start, end } = context.params.dateRange;
          if (new Date(start) > new Date(end)) {
            throw new Error('Start date must be before end date');
          }
        }
        break;
        
      case 'checkPermissions':
        // Additional permission checks can be implemented here
        break;
        
      case 'sendNotification':
        console.log(`📬 Notification: Function ${functionName} completed for user ${context.user?.sub}`);
        break;
        
      case 'updateUsageStats':
        console.log(`📊 Usage stats updated for function ${functionName}`);
        break;
        
      case 'logError':
        console.error(`📝 Error logged for function ${functionName}:`, context.error);
        break;
    }
  }

  async handleFunctionError(error, functionDef, context) {
    const errorHandling = functionDef.errorHandling;
    
    if (errorHandling.strategy === 'rollback' && errorHandling.rollbackSteps) {
      console.log('🔄 Rolling back function execution...');
      
      for (const stepId of errorHandling.rollbackSteps) {
        try {
          await this.rollbackStep(stepId, context);
        } catch (rollbackError) {
          console.error(`Rollback failed for step ${stepId}:`, rollbackError);
        }
      }
    }

    if (errorHandling.retryCount && errorHandling.retryCount > 0) {
      console.log(`🔄 Retrying function execution (${errorHandling.retryCount} attempts remaining)...`);
      // Implement retry logic here
    }
  }

  async rollbackStep(stepId, context) {
    // Implement rollback logic for specific step types
    console.log(`🔄 Rolling back step: ${stepId}`);
  }

  // Get function execution statistics
  getExecutionStats() {
    return {
      totalFunctions: this.functions.size,
      supportedStepTypes: Array.from(this.stepExecutors.keys()),
      availableTransforms: Array.from(this.transformScripts.keys())
    };
  }

  // List all available functions
  listFunctions() {
    return Array.from(this.functions.entries()).map(([name, func]) => ({
      name,
      description: func.description,
      method: func.method,
      category: func.category,
      steps: func.steps.length,
      permissions: func.permissions
    }));
  }
}

export default FunctionExecutor;
