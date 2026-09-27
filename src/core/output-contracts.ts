import { type SecuritySignal } from './security-contracts.js';

export type OutputSink = 'json' | 'markdown' | 'html' | 'terminal' | 'log';

export interface PrepareOutputRequest {
  sink?: OutputSink;
  content?: unknown;
}

export interface PrepareOutputResponse {
  sink: OutputSink;
  content: unknown;
  signals: SecuritySignal[];
}

export interface SystemPromptPolicyRequest {
  role: string;
  allow?: string[];
  deny?: string[];
  capabilities?: string[];
  externalContentLabel?: string;
}

export interface SystemPromptPolicy {
  role: string;
  allow: string[];
  deny: string[];
  capabilities: string[];
  externalContentLabel?: string;
}

export interface SystemPromptResponse {
  content: string;
  trustedAsInstruction: true;
}
