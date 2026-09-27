import {
  type SecurityDecision,
  type SecuritySignal,
} from './security-contracts.js';

export type ContextItemRole = 'user' | 'assistant' | 'tool' | 'system';
export type ContextItemSource =
  | 'user_input'
  | 'assistant_output'
  | 'tool_output'
  | 'upstream_api'
  | 'retrieved_document'
  | 'system_config';

export interface ModelContextItem {
  role: ContextItemRole;
  content: unknown;
  source: ContextItemSource;
  trustedAsInstruction: boolean;
}

export interface ContextPolicy {
  maxItems?: number;
  maxContextBytes?: number;
  maxTextLength?: number;
  redactSecretLikeKeys?: boolean;
  quarantineOnScannerSignals?: boolean;
}

export interface MemoryWritePolicy {
  maxItems?: number;
  maxMemoryBytes?: number;
  maxTextLength?: number;
  allowedSources?: ContextItemSource[];
  redactSecretLikeKeys?: boolean;
  quarantineOnScannerSignals?: boolean;
}

export interface PrepareModelContextRequest {
  messages?: {
    role?: ContextItemRole;
    content?: unknown;
  }[];
  policy?: ContextPolicy;
}

export interface PrepareMemoryWriteRequest {
  memories?: {
    role?: ContextItemRole;
    content?: unknown;
  }[];
  policy?: MemoryWritePolicy;
}

export interface PrepareModelContextResponse {
  decision: SecurityDecision;
  messages: ModelContextItem[];
  signals: SecuritySignal[];
}

export interface RetrievedContextItem {
  id: string;
  sourceId: string;
  content: unknown;
  tenantId?: string;
  score?: number;
}

export interface RetrievalPolicy {
  maxItems?: number;
  maxContextBytes?: number;
  maxTextLength?: number;
  minScore?: number;
  requiredTenantId?: string;
  allowedSourceIds?: string[];
  maxItemsPerSource?: number;
  redactSecretLikeKeys?: boolean;
  quarantineOnScannerSignals?: boolean;
}

export interface PrepareRetrievalRequest {
  items?: RetrievedContextItem[];
  policy?: RetrievalPolicy;
}
