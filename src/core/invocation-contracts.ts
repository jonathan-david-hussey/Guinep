import {
  type ExecutionContext,
  type JsonObject,
  type JsonSchema,
} from './common-contracts.js';
import {
  type ContextSafety,
  type SecuritySummary,
} from './security-contracts.js';

export interface InvokeOperationRequest {
  input: JsonObject;
  context?: Partial<ExecutionContext>;
}

export interface InvokeOperationResponse {
  success: boolean;
  operationId: string;
  status: number;
  providerStatus?: number;
  recoverable?: boolean;
  code?: string;
  message?: string;
  data?: unknown;
  contextSafety?: ContextSafety;
  security?: SecuritySummary;
}

export interface ValidateModelOutputRequest {
  output?: unknown;
  schema?: JsonSchema;
}

export interface ToolSchema {
  operationId: string;
  name: string;
  description?: string;
  inputSchema: JsonSchema;
  propertyOrder: string[];
  examples: JsonObject[];
}

export interface AgentTool {
  name: string;
  description?: string;
  inputSchema: JsonSchema;
  operationId: string;
}

export interface AgentToolCallRequest {
  arguments?: JsonObject;
  context?: Partial<ExecutionContext>;
}
