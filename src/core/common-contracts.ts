export const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof httpMethods)[number];

export type JsonObject = Record<string, unknown>;
export type JsonSchema = JsonObject;

export interface ConnectionSpec {
  id: string;
  baseUrl: string;
  secrets: Record<string, string>;
}

export const executionSources = [
  'api',
  'agent',
  'chat',
  'mcp',
  'n8n',
  'vapi',
] as const;
export type ExecutionSource = (typeof executionSources)[number];

export interface ExecutionContext {
  source: ExecutionSource;
  userId?: string;
  sessionId?: string;
  runId?: string;
  capabilities?: string[];
  toolCallDepth?: number;
}

export interface ValidationFailure {
  path: string;
  code: string;
  message: string;
  details?: unknown;
}
