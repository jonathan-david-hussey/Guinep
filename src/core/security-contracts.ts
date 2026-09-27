import { type HttpMethod } from './common-contracts.js';

export type SecurityDecision =
  'allow' | 'quarantine' | 'require_approval' | 'block';

export interface SecuritySignal {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'block';
  category:
    'policy' | 'budget' | 'approval' | 'context' | 'scanner' | 'capability';
  path?: string;
}

export interface ContextSafety {
  trustedAsInstruction: false;
  source: 'upstream_api';
}

export interface SecuritySummary {
  decision: SecurityDecision;
  signals: SecuritySignal[];
}

export interface ApprovalPreview {
  operationId: string;
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}
