import { Injectable } from '@nestjs/common';
import {
  type ExecutionContext,
  type ModelContextItem,
  type PrepareModelContextResponse,
  type RetrievalPolicy,
  type RetrievedContextItem,
  type SecuritySignal,
} from './contracts.js';
import { scanTextContent } from './security-scanner.js';
import { SecurityEventService } from './security-event.service.js';
import { jsonBytes, securityDecisionFor } from './text-safety.js';
import {
  defaultRetrievalPolicy,
  mergeRetrievalPolicy,
  retrievedMessage,
} from './retrieval-context.js';

@Injectable()
export class RetrievalGuardService {
  public constructor(private readonly events: SecurityEventService) {}

  prepareRetrievedContent(
    items: RetrievedContextItem[],
    context: ExecutionContext,
    policy: RetrievalPolicy = defaultRetrievalPolicy,
  ): PrepareModelContextResponse {
    const activePolicy = mergeRetrievalPolicy(policy);
    const messages = items.map((item) => retrievedMessage(item, activePolicy));
    const signals = [
      ...itemCountSignals(items, activePolicy),
      ...contextSizeSignals(messages, activePolicy),
      ...sourceCountSignals(items, activePolicy),
      ...items.flatMap((item, index) =>
        retrievalPolicySignals(item, index, activePolicy),
      ),
      ...messages.flatMap((item, index) =>
        itemSignals(item, index, activePolicy),
      ),
    ];
    const decision = decisionFor(signals, activePolicy);
    this.events.record('retrieval-context', context, decision, signals);
    return {
      decision,
      messages: decision === 'allow' ? messages : [],
      signals,
    };
  }
}

function itemCountSignals(
  items: RetrievedContextItem[],
  policy: Required<RetrievalPolicy>,
): SecuritySignal[] {
  return items.length > policy.maxItems
    ? [blockSignal('retrieval_item_limit_exceeded', '$.items')]
    : [];
}

function contextSizeSignals(
  items: ModelContextItem[],
  policy: Required<RetrievalPolicy>,
): SecuritySignal[] {
  return jsonBytes(items) > policy.maxContextBytes
    ? [blockSignal('retrieval_context_size_exceeded', '$.items')]
    : [];
}

function sourceCountSignals(
  items: RetrievedContextItem[],
  policy: Required<RetrievalPolicy>,
): SecuritySignal[] {
  return Object.entries(countBySource(items)).flatMap(([sourceId, count]) =>
    count > policy.maxItemsPerSource
      ? [
          blockSignal(
            'retrieval_source_item_limit_exceeded',
            `$.items[sourceId=${sourceId}]`,
          ),
        ]
      : [],
  );
}

function retrievalPolicySignals(
  item: RetrievedContextItem,
  index: number,
  policy: Required<RetrievalPolicy>,
): SecuritySignal[] {
  return [
    ...sourceSignals(item, index, policy),
    ...tenantSignals(item, index, policy),
    ...scoreSignals(item, index, policy),
  ];
}

function sourceSignals(
  item: RetrievedContextItem,
  index: number,
  policy: Required<RetrievalPolicy>,
): SecuritySignal[] {
  return policy.allowedSourceIds.length === 0 ||
    policy.allowedSourceIds.includes(item.sourceId)
    ? []
    : [
        blockSignal(
          'retrieval_source_not_allowed',
          itemPath(index, 'sourceId'),
        ),
      ];
}

function tenantSignals(
  item: RetrievedContextItem,
  index: number,
  policy: Required<RetrievalPolicy>,
): SecuritySignal[] {
  return policy.requiredTenantId.length === 0 ||
    item.tenantId === policy.requiredTenantId
    ? []
    : [blockSignal('retrieval_tenant_mismatch', itemPath(index, 'tenantId'))];
}

function scoreSignals(
  item: RetrievedContextItem,
  index: number,
  policy: Required<RetrievalPolicy>,
): SecuritySignal[] {
  return item.score === undefined || item.score >= policy.minScore
    ? []
    : [blockSignal('retrieval_score_too_low', itemPath(index, 'score'))];
}

function itemSignals(
  item: ModelContextItem,
  index: number,
  policy: Required<RetrievalPolicy>,
): SecuritySignal[] {
  return scanTextContent(item.content, {
    basePath: `$.items.${String(index)}.content`,
    maxTextLength: policy.maxTextLength,
    textTooLargeCode: 'retrieval_text_limit_exceeded',
  });
}

function countBySource(items: RetrievedContextItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.sourceId] = (counts[item.sourceId] ?? 0) + 1;
  }

  return counts;
}

function decisionFor(
  signals: SecuritySignal[],
  policy: Required<RetrievalPolicy>,
): ReturnType<typeof securityDecisionFor> {
  return securityDecisionFor(signals, policy.quarantineOnScannerSignals);
}

function itemPath(index: number, path: string): string {
  return `$.items.${String(index)}.${path}`;
}

function blockSignal(code: string, path: string): SecuritySignal {
  return {
    code,
    path,
    severity: 'block',
    category: code.includes('limit') ? 'budget' : 'policy',
    message: messageFor(code),
  };
}

function messageFor(code: string): string {
  return messages()[code] ?? 'Retrieved content failed security policy.';
}

function messages(): Record<string, string> {
  return {
    retrieval_context_size_exceeded: 'Retrieved context size exceeds policy.',
    retrieval_item_limit_exceeded: 'Retrieved item count exceeds policy.',
    retrieval_score_too_low: 'Retrieved item score is below policy.',
    retrieval_source_item_limit_exceeded:
      'Retrieved source item count exceeds policy.',
    retrieval_source_not_allowed: 'Retrieved source is not allowed.',
    retrieval_tenant_mismatch: 'Retrieved item tenant does not match policy.',
    retrieval_text_limit_exceeded: 'Retrieved item text length exceeds policy.',
  };
}
