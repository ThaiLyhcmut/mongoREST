import { ObjectId, Collection, Db, InsertManyResult } from 'mongodb';
import { AggregateStep, BaseStep, ConditionResult, ConditionStep, CountStep, DbManager, DelayResult, DelayStep, DeleteManyStep, DeleteOneStep, DeleteResult, DistinctStep, ExecutionContext, ExecutionStats, FindOneStep, FindStep, FunctionContext, FunctionResult, HttpResponse, HttpStep, InsertManyStep, InsertOneResult, InsertOneStep, ProcessedReport, Step, StepResult, TransformStep, UpdateManyStep, UpdateOneStep, UpdateResult, UserOrderInput, UserReportInput } from '../config/core/function-executor';
import SchemaLoader from './schema-loader';
import { FunctionDefinition } from '../config/core/schema-loader.config';
import { FunctionSummary } from '../config/route/functions.config';




type StepExecutor = (step: BaseStep, context: ExecutionContext) => Promise<any>;
type TransformScript = (input: any, context: ExecutionContext) => Promise<any>;

class FunctionExecutor {
  private schemaLoader: SchemaLoader;
  private dbManager: DbManager;
  private functions: Map<string, FunctionDefinition>;
  private stepExecutors: Map<string, StepExecutor>;
  private transformScripts: Map<string, TransformScript>;

  constructor(schemaLoader: SchemaLoader, dbManager: DbManager) {
    this.schemaLoader = schemaLoader;
    this.dbManager = dbManager;
    this.functions = schemaLoader.functions;
    this.stepExecutors = new Map<string, StepExecutor>();
    this.transformScripts = new Map<string, TransformScript>();
    this.initializeStepExecutors();
    this.initializeTransformScripts();
  }

  // Initialize step executors for different operation types
  private initializeStepExecutors(): void {
    // MongoDB operations
    this.stepExecutors.set('find', this.executeFindStep.bind(this) as any);
    this.stepExecutors.set('findOne', this.executeFindOneStep.bind(this) as any);
    this.stepExecutors.set('insertOne', this.executeInsertOneStep.bind(this) as any);
    this.stepExecutors.set('insertMany', this.executeInsertManyStep.bind(this) as any);
    this.stepExecutors.set('updateOne', this.executeUpdateOneStep.bind(this) as any);
    this.stepExecutors.set('updateMany', this.executeUpdateManyStep.bind(this) as any);
    this.stepExecutors.set('deleteOne', this.executeDeleteOneStep.bind(this) as any);
    this.stepExecutors.set('deleteMany', this.executeDeleteManyStep.bind(this) as any);
    this.stepExecutors.set('aggregate', this.executeAggregateStep.bind(this) as any);
    this.stepExecutors.set('countDocuments', this.executeCountStep.bind(this) as any);
    this.stepExecutors.set('distinct', this.executeDistinctStep.bind(this) as any);

    // Utility operations
    this.stepExecutors.set('transform', this.executeTransformStep.bind(this) as any);
    this.stepExecutors.set('condition', this.executeConditionStep.bind(this) as any);
    this.stepExecutors.set('http', this.executeHttpStep.bind(this) as any);
    this.stepExecutors.set('delay', this.executeDelayStep.bind(this) as any);
  }

  // Initialize transform scripts
  private initializeTransformScripts(): void {
    // Example transform scripts - these would typically be loaded from files or config
    this.transformScripts.set('processUserReportData', this.processUserReportData.bind(this));
    this.transformScripts.set('mergeUserOrderData', this.mergeUserOrderData.bind(this));
    this.transformScripts.set('userToCRMFormat', this.userToCRMFormat.bind(this));
  }

  // Main function execution method
  async executeFunction(functionName: string, params: any, context: FunctionContext): Promise<FunctionResult> {
    const startTime = Date.now();
    
    try {
      const functionDef: any = this.functions.get(functionName);
      if (!functionDef) {
        throw new Error(`Function '${functionName}' not found`);
      }

      console.log(`🚀 Executing function: ${functionName}`);

      // Validate input parameters
      this.validateFunctionInput(functionDef, params);

      // Execute pre-execution hooks
      await this.executeHooks(functionDef.hooks?.beforeExecution, functionName, { params, context });

      // Initialize execution context
      const executionContext: ExecutionContext = {
        functionName,
        params,
        steps: new Map<string, StepResult>(),
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
          await this.handleFunctionError(error as Error, functionDef, executionContext);
        }

        throw error;
      }

    } catch (error) {
      const totalExecutionTime = Date.now() - startTime;
      
      console.error(`❌ Function ${functionName} failed after ${totalExecutionTime}ms:`, error);

      return {
        success: false,
        function: functionName,
        error: (error as Error).message,
        meta: {
          executionTime: `${totalExecutionTime}ms`,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  // Execute individual step
  private async executeStep(step: Step, context: ExecutionContext): Promise<any> {
    const executor = this.stepExecutors.get(step.type);
    if (!executor) {
      throw new Error(`Unknown step type: ${step.type}`);
    }

    // Resolve template variables in step configuration
    const resolvedStep = this.resolveTemplates(step, context);
    
    // Add step timeout
    const timeout = parseInt(process.env.FUNCTION_TIMEOUT || '30000');
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error(`Step ${step.id} timed out after ${timeout}ms`)), timeout)
    );

    // Execute step with timeout
    const stepPromise = executor(resolvedStep, context);
    
    return await Promise.race([stepPromise, timeoutPromise]);
  }

  // Resolve template variables in object
  private resolveTemplates<T>(obj: T, context: ExecutionContext): T {
    const resolved = JSON.parse(JSON.stringify(obj));
    
    this.replaceTemplatesRecursive(resolved, context);
    
    return resolved;
  }

  // Recursively replace template variables
  private replaceTemplatesRecursive(obj: any, context: ExecutionContext): any {
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
  private replaceTemplateString(str: string, context: ExecutionContext): string {
    const templateRegex = /\{\{([^}]+)\}\}/g;
    
    return str.replace(templateRegex, (match, path) => {
      try {
        const value = this.getValueByPath(context, path.trim());
        return value !== undefined ? value : match;
      } catch (error) {
        console.warn(`Template resolution failed for ${path}:`, (error as Error).message);
        return match;
      }
    });
  }

  // Get value by dot notation path
  private getValueByPath(obj: any, path: string): any {
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
  private async executeFindStep(step: FindStep, context: ExecutionContext): Promise<any[]> {
    const collection = this.dbManager.collection(step.collection);
    const query = step.query || {};
    const options = step.options || {};
    
    const result = await collection.find(query, options).toArray();
    return result;
  }

  private async executeFindOneStep(step: FindOneStep, context: ExecutionContext): Promise<any> {
    const collection = this.dbManager.collection(step.collection);
    const query = step.query || {};
    const options = step.options || {};
    
    const result = await collection.findOne(query, options);
    return result;
  }

  private async executeInsertOneStep(step: InsertOneStep, context: ExecutionContext): Promise<InsertOneResult> {
    const collection = this.dbManager.collection(step.collection);
    const document:any = step.document;
    
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

  private async executeInsertManyStep(step: InsertManyStep, context: ExecutionContext): Promise<InsertManyResult> {
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

  private async executeUpdateOneStep(step: UpdateOneStep, context: ExecutionContext): Promise<UpdateResult> {
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

  private async executeUpdateManyStep(step: UpdateManyStep, context: ExecutionContext): Promise<UpdateResult> {
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

  private async executeDeleteOneStep(step: DeleteOneStep, context: ExecutionContext): Promise<DeleteResult> {
    const collection = this.dbManager.collection(step.collection);
    const filter = step.filter || {};
    
    const result = await collection.deleteOne(filter);
    return {
      deletedCount: result.deletedCount,
      acknowledged: result.acknowledged
    };
  }

  private async executeDeleteManyStep(step: DeleteManyStep, context: ExecutionContext): Promise<DeleteResult> {
    const collection = this.dbManager.collection(step.collection);
    const filter = step.filter || {};
    
    const result = await collection.deleteMany(filter);
    return {
      deletedCount: result.deletedCount,
      acknowledged: result.acknowledged
    };
  }

  private async executeAggregateStep(step: AggregateStep, context: ExecutionContext): Promise<any[]> {
    const collection = this.dbManager.collection(step.collection);
    const pipeline = step.pipeline || [];
    const options = step.options || {};
    
    const result = await collection.aggregate(pipeline, options).toArray();
    return result;
  }

  private async executeCountStep(step: CountStep, context: ExecutionContext): Promise<number> {
    const collection = this.dbManager.collection(step.collection);
    const query = step.query || {};
    
    const count = await collection.countDocuments(query);
    return count;
  }

  private async executeDistinctStep(step: DistinctStep, context: ExecutionContext): Promise<any[]> {
    const collection = this.dbManager.collection(step.collection);
    const field = step.field;
    const query = step.query || {};
    
    const result = await collection.distinct(field, query);
    return result;
  }

  // Utility Step Executors
  private async executeTransformStep(step: TransformStep, context: ExecutionContext): Promise<any> {
    const scriptName = step.script;
    const input = step.input || {};
    
    const script = this.transformScripts.get(scriptName);
    if (!script) {
      throw new Error(`Transform script '${scriptName}' not found`);
    }
    
    return await script(input, context);
  }

  private async executeConditionStep(step: ConditionStep, context: ExecutionContext): Promise<ConditionResult> {
    const condition = step.condition;
    const thenSteps = step.then || [];
    const elseSteps = step.else || [];
    
    // Evaluate condition (simple implementation)
    const conditionResult = this.evaluateCondition(condition, context);
    const stepsToExecute = conditionResult ? thenSteps : elseSteps;
    
    const results = [];
    for (const subStep of stepsToExecute) {
      const result = await this.executeStep(subStep as any, context);
      results.push(result);
    }
    
    return {
      condition: conditionResult,
      results
    };
  }

  private async executeHttpStep(step: HttpStep, context: ExecutionContext): Promise<HttpResponse> {
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
        signal: AbortSignal.timeout(timeout)
      });
      
      const data = await response.json();
      
      return {
        status: response.status,
        success: response.ok,
        data,
        headers: Object.fromEntries(response.headers.entries())
      };
    } catch (error) {
      throw new Error(`HTTP request failed: ${(error as Error).message}`);
    }
  }

  private async executeDelayStep(step: DelayStep, context: ExecutionContext): Promise<DelayResult> {
    const duration = step.duration || 1000;
    
    await new Promise(resolve => setTimeout(resolve, duration));
    
    return {
      delayed: duration,
      timestamp: new Date().toISOString()
    };
  }

  // Transform Scripts
  private async processUserReportData(input: UserReportInput, context: ExecutionContext): Promise<ProcessedReport> {
    const { userStats, newUsers, activeUsers, segments } = input;
    
    const processed: ProcessedReport = {
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

  private async mergeUserOrderData(input: UserOrderInput, context: ExecutionContext): Promise<any[]> {
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

  private async userToCRMFormat(input: any, context: ExecutionContext): Promise<any[]> {
    if (!Array.isArray(input)) {
      input = [input];
    }

    return input.map((user: any) => ({
      external_id: user._id,
      email: user.email,
      full_name: user.name,
      country_code: this.getCountryCode(user.profile?.country),
      last_updated: user.updatedAt
    }));
  }

  // Helper methods
  private getCountryCode(country?: string): string {
    const countryMap: Record<string, string> = {
      'Vietnam': 'VN',
      'Thailand': 'TH',
      'Malaysia': 'MY',
      'Singapore': 'SG',
      'Indonesia': 'ID',
      'Philippines': 'PH'
    };
    return countryMap[country || ''] || 'Unknown';
  }

  private evaluateCondition(condition: string, context: ExecutionContext): boolean {
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
  private validateFunctionInput(functionDef: FunctionDefinition, params: any): void {
    if (functionDef.input) {
      const validation = this.schemaLoader.validateFunctionInput(functionDef.name, params);
      if (!validation.valid) {
        throw new Error(`Invalid function input: ${JSON.stringify(validation.errors)}`);
      }
    }
  }

  private formatOutput(functionDef: FunctionDefinition, context: ExecutionContext): any {
    if (functionDef.output) {
      // If output schema is defined, format according to schema
      const lastStep = context.steps.get(functionDef.steps[functionDef.steps.length - 1].id);
      return lastStep?.output;
    }
    
    // Default: return all step outputs
    const outputs: Record<string, any> = {};
    for (const [stepId, stepResult] of context.steps) {
      outputs[stepId] = stepResult.output;
    }
    return outputs;
  }

  private async executeHooks(hooks: string[] | undefined, functionName: string, context: any): Promise<void> {
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

  private async executeHook(hookName: string, functionName: string, context: any): Promise<void> {
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

  private async handleFunctionError(error: Error, functionDef: FunctionDefinition, context: ExecutionContext): Promise<void> {
    const errorHandling:any = functionDef.errorHandling;
    
    if (errorHandling?.strategy === 'rollback' && errorHandling.rollbackSteps) {
      console.log('🔄 Rolling back function execution...');
      
      for (const stepId of errorHandling.rollbackSteps) {
        try {
          await this.rollbackStep(stepId, context);
        } catch (rollbackError) {
          console.error(`Rollback failed for step ${stepId}:`, rollbackError);
        }
      }
    }

    if (errorHandling?.retryCount && errorHandling.retryCount > 0) {
      console.log(`🔄 Retrying function execution (${errorHandling.retryCount} attempts remaining)...`);
      // Implement retry logic here
    }
  }

  private async rollbackStep(stepId: string, context: ExecutionContext): Promise<void> {
    // Implement rollback logic for specific step types
    console.log(`🔄 Rolling back step: ${stepId}`);
  }

  // Get function execution statistics
  getExecutionStats(): ExecutionStats {
    return {
      totalFunctions: this.functions.size,
      supportedStepTypes: Array.from(this.stepExecutors.keys()),
      availableTransforms: Array.from(this.transformScripts.keys())
    };
  }

  // List all available functions
  listFunctions(): FunctionSummary[] {
    return Array.from(this.functions.entries()).map(([name, func]: any) => ({
      name,
      description: func.description,
      method: func.method,
      category: func.category,
      steps: func.steps.length,
      permissions: func.permissions
    }) as any);
  }
}

export default FunctionExecutor;