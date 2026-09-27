import {
  type ContextItemRole,
  type ContextItemSource,
  type ContextPolicy,
  type MemoryWritePolicy,
  type ModelContextItem,
} from './contracts.js';
import { stripInvisibleCharacters } from './security-scanner.js';
import { redactSecretLikeKeys } from './text-safety.js';

export const defaultContextPolicy: Required<ContextPolicy> = {
  maxItems: 20,
  maxContextBytes: 64_000,
  maxTextLength: 8_000,
  redactSecretLikeKeys: true,
  quarantineOnScannerSignals: true,
};

export const defaultMemoryWritePolicy: Required<MemoryWritePolicy> = {
  maxItems: 10,
  maxMemoryBytes: 16_000,
  maxTextLength: 4_000,
  allowedSources: ['user_input', 'assistant_output'],
  redactSecretLikeKeys: true,
  quarantineOnScannerSignals: true,
};

export function mergeContextPolicy(
  policy: ContextPolicy,
): Required<ContextPolicy> {
  return { ...defaultContextPolicy, ...policy };
}

export function mergeMemoryWritePolicy(
  policy: MemoryWritePolicy,
): Required<MemoryWritePolicy> {
  return { ...defaultMemoryWritePolicy, ...policy };
}

export function sanitizeContextItem(
  item: ModelContextItem,
  policy: Required<ContextPolicy>,
): ModelContextItem {
  return {
    ...item,
    content: sanitizeContent(item.content, policy.redactSecretLikeKeys),
    trustedAsInstruction: trustedAsInstruction(item),
  };
}

export function sanitizeMemoryWriteItem(
  item: ModelContextItem,
  policy: Required<MemoryWritePolicy>,
): ModelContextItem {
  return {
    ...item,
    content: sanitizeContent(item.content, policy.redactSecretLikeKeys),
    trustedAsInstruction: false,
  };
}

export function sourceForRole(role: ContextItemRole): ContextItemSource {
  if (role === 'assistant') {
    return 'assistant_output';
  }

  if (role === 'tool') {
    return 'tool_output';
  }

  return 'user_input';
}

function sanitizeContent(value: unknown, redactSecrets: boolean): unknown {
  return stripInvisibleCharacters(
    redactSecrets ? redactSecretLikeKeys(value) : value,
  );
}

function trustedAsInstruction(item: ModelContextItem): boolean {
  return item.role === 'system' && item.source === 'system_config';
}
