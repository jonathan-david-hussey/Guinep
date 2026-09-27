import {
  type ExecutionSource,
  type HttpMethod,
  type JsonObject,
} from './common-contracts.js';

export interface MappingRule {
  from: string;
  to: string;
  required?: boolean;
  defaultValue?: unknown;
  transform?: 'string' | 'number' | 'integer' | 'boolean' | 'jsonStringify';
}

export interface InputPolicy {
  unknownProperties?: 'allow' | 'strip' | 'reject';
  allowedPaths?: string[];
  blockedPaths?: string[];
  validators?: InputValidator[];
}

export type InputValidator =
  | {
      type: 'required';
      path: string;
      code: string;
      message: string;
    }
  | {
      type: 'requiredAny';
      paths: string[];
      code: string;
      message: string;
    }
  | {
      type: 'requires';
      whenPath: string;
      whenEquals: unknown;
      requiredPath: string;
      code: string;
      message: string;
    }
  | {
      type: 'mutuallyExclusive';
      paths: string[];
      code: string;
      message: string;
    }
  | {
      type: 'equals' | 'notEquals';
      path: string;
      value: unknown;
      code: string;
      message: string;
    }
  | {
      type: 'oneOf';
      path: string;
      values: unknown[];
      code: string;
      message: string;
    }
  | {
      type: 'matches';
      path: string;
      pattern: string;
      code: string;
      message: string;
    }
  | {
      type: 'length';
      path: string;
      min?: number;
      max?: number;
      code: string;
      message: string;
    }
  | {
      type: 'range';
      path: string;
      min?: number;
      max?: number;
      code: string;
      message: string;
    };

export interface ToolPolicy {
  name?: string;
  description?: string;
  propertyOrder?: string[];
  hiddenInputPaths?: string[];
  examples?: JsonObject[];
  provenance?: ToolProvenancePolicy;
}

interface ToolProvenancePolicy {
  source: 'local' | 'mcp' | 'plugin' | 'workflow';
  packageName: string;
  version: string;
  sha256: string;
  signature?: string;
  descriptionAuditSha256?: string;
}

export type AuthPolicy =
  | { type: 'none' }
  | { type: 'apiKeyHeader'; headerName: string; credentialRef: string }
  | { type: 'apiKeyQuery'; queryName: string; credentialRef: string }
  | { type: 'basic'; usernameRef: string; passwordRef: string }
  | { type: 'bearer'; tokenRef: string };

export interface SecurityPolicy {
  allowedHosts: string[];
  allowedSchemes?: ('http' | 'https')[];
  allowPrivateNetwork?: boolean;
  allowedMethods: HttpMethod[];
  blockedRequestHeaders: string[];
  redactedRequestPaths: string[];
  redactedResponsePaths: string[];
}

export type RequestFailureCategory =
  | 'input_policy'
  | 'input_schema'
  | 'mapping'
  | 'connection'
  | 'auth'
  | 'security';

export interface RequestFailurePolicy {
  mode: 'fail' | 'defaultResponse' | 'customResponse';
  categories?: RequestFailureCategory[];
  status?: number;
  code?: string;
  message?: string;
  recoverable?: boolean;
  includeFailures?: boolean;
  data?: unknown;
  response?: {
    status?: number;
    code?: string;
    message?: string;
    recoverable?: boolean;
    data?: unknown;
  };
}

export interface ExecutionPolicy {
  allowedSources?: ExecutionSource[];
  requiredCapabilities?: string[];
  requiredGroundingPaths?: string[];
  effects?: string[];
  dataClasses?: Record<string, string[]>;
  approval?: ApprovalPolicy;
  budgets?: ExecutionBudgetPolicy;
}

export interface ApprovalPolicy {
  mode: 'never' | 'always' | 'ruleOfTwo';
  reason?: string;
}

interface ExecutionBudgetPolicy {
  maxCallsPerRun?: number;
  maxCallsPerMinute?: number;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
  maxToolCallDepth?: number;
  maxTextLength?: number;
}

export interface RetryPolicy {
  maxAttempts: number;
  statusRanges: StatusRange[];
}

export interface StatusRange {
  min: number;
  max: number;
}
