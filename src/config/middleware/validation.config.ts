interface MethodConfig {
  mappings?: { [method: string]: { allowedOperations: string[] } };
  specialCases?: { [key: string]: any };
  operationInference?: { [key: string]: any };
  strict?: boolean;
  validation?: {
    enabled: boolean;
    logViolations: boolean;
    rejectOnViolation: boolean;
  };
}

interface ValidationError {
  error: string;
  message: string;
  method?: string;
  operation?: string;
  allowed?: string[];
  suggestion?: string;
}

interface SchemaValidationOptions {
  strict?: boolean;
  coerceTypes?: boolean;
  removeAdditional?: boolean;
}

export {
    MethodConfig,
    ValidationError,
    SchemaValidationOptions
}