import { type HttpMethod, type JsonSchema } from './common-contracts.js';
import { type ContentType } from './http-contracts.js';
import {
  type AuthPolicy,
  type ExecutionPolicy,
  type InputPolicy,
  type MappingRule,
  type RequestFailurePolicy,
  type RetryPolicy,
  type SecurityPolicy,
  type ToolPolicy,
} from './operation-policy-contracts.js';
import { type ResponsePolicy } from './response-contracts.js';

export interface OperationSpec {
  id: string;
  version: string;
  displayName?: string;
  status: 'draft' | 'published';
  connectionId: string;
  request: OperationRequestSpec;
  requestFailurePolicy?: RequestFailurePolicy;
  inputSchema: JsonSchema;
  inputPolicy?: InputPolicy;
  toolPolicy?: ToolPolicy;
  authPolicy: AuthPolicy;
  responsePolicy: ResponsePolicy;
  securityPolicy: SecurityPolicy;
  executionPolicy?: ExecutionPolicy;
  retryPolicy?: RetryPolicy;
}

interface OperationRequestSpec {
  method: HttpMethod;
  path: string;
  contentType?: ContentType;
  timeoutMs?: number;
  mappings: MappingRule[];
}

export * from './http-contracts.js';
export * from './operation-policy-contracts.js';
export * from './response-contracts.js';
