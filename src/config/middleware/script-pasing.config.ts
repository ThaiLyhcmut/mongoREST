interface ScriptRequestBody {
  script?: string;
  mongoScript?: string;
  query?: string;
  [key: string]: any;
}

interface ParserResult {
  collection: any;
  operation: any;
  params: any;
  meta?: {
    originalScript: string;
    complexity: number;
    collections: string[];
    parsedAt: string;
  };
}

interface ParsedScript {
  collection: string;
  operation: string;
  params: { [key: string]: any };
  meta?: ParserResult['meta'];
}

export {
    ScriptRequestBody,
    ParserResult,
    ParsedScript
}