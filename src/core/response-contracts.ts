import {
  type MappingRule,
  type StatusRange,
} from './operation-policy-contracts.js';

export interface ResponsePolicy {
  success?: ResponseTransformPolicy;
  error?: ErrorPolicy;
}

export interface ResponseTransformPolicy {
  unwrap?: string;
  filters?: ResponseFilterRule[];
  sort?: ResponseSortRule[];
  include?: string[];
  exclude?: string[];
  redact?: string[];
  limit?: number;
  mappings?: MappingRule[];
}

export interface ResponseFilterRule {
  path: string;
  equals?: unknown;
  notEquals?: unknown;
  exists?: boolean;
}

export interface ResponseSortRule {
  path: string;
  direction?: 'asc' | 'desc';
  type?: 'string' | 'number' | 'boolean';
}

interface ErrorPolicy {
  rules: ErrorRule[];
}

export interface ErrorRule {
  status?: number;
  statusRange?: StatusRange;
  bodyPath?: string;
  bodyEquals?: unknown;
  failureKind?: UpstreamFailureKind;
  behavior: 'fail' | 'return' | 'retry_then_fail' | 'retry_then_return';
  code: string;
  message: string;
  recoverable?: boolean;
}

type UpstreamFailureKind = 'http' | 'network' | 'timeout';

export type UpstreamResult =
  | {
      ok: true;
      status: number;
      headers: Record<string, string>;
      body: unknown;
    }
  | {
      ok: false;
      status?: number;
      headers?: Record<string, string>;
      body?: unknown;
      failureKind: UpstreamFailureKind;
    };
