import {
  type ModelContextItem,
  type RetrievalPolicy,
  type RetrievedContextItem,
} from './contracts.js';
import { stripInvisibleCharacters } from './security-scanner.js';
import { redactSecretLikeKeys } from './text-safety.js';

export const defaultRetrievalPolicy: Required<RetrievalPolicy> = {
  maxItems: 10,
  maxContextBytes: 48_000,
  maxTextLength: 8_000,
  minScore: 0,
  requiredTenantId: '',
  allowedSourceIds: [],
  maxItemsPerSource: 5,
  redactSecretLikeKeys: true,
  quarantineOnScannerSignals: true,
};

export function mergeRetrievalPolicy(
  policy: RetrievalPolicy,
): Required<RetrievalPolicy> {
  return { ...defaultRetrievalPolicy, ...policy };
}

export function retrievedMessage(
  item: RetrievedContextItem,
  policy: Required<RetrievalPolicy>,
): ModelContextItem {
  return {
    role: 'tool',
    source: 'retrieved_document',
    trustedAsInstruction: false,
    content: {
      id: item.id,
      sourceId: item.sourceId,
      tenantId: item.tenantId,
      score: item.score,
      content: stripInvisibleCharacters(
        policy.redactSecretLikeKeys
          ? redactSecretLikeKeys(item.content)
          : item.content,
      ),
    },
  };
}
