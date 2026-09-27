import { Injectable } from '@nestjs/common';
import {
  type ContextItemRole,
  type ContextPolicy,
  type ExecutionContext,
  type MemoryWritePolicy,
  type ModelContextItem,
  type PrepareModelContextResponse,
  type SecuritySignal,
} from './contracts.js';
import {
  defaultContextPolicy,
  defaultMemoryWritePolicy,
  mergeContextPolicy,
  mergeMemoryWritePolicy,
  sanitizeContextItem,
  sanitizeMemoryWriteItem,
  sourceForRole,
} from './context-guard-policy.js';
import { scanTextContent } from './security-scanner.js';
import { SecurityEventService } from './security-event.service.js';
import { jsonBytes, securityDecisionFor } from './text-safety.js';

@Injectable()
export class ContextGuardService {
  public constructor(private readonly events: SecurityEventService) {}

  prepareForModel(
    items: ModelContextItem[],
    context: ExecutionContext,
    policy: ContextPolicy = defaultContextPolicy,
  ): PrepareModelContextResponse {
    const activePolicy = mergeContextPolicy(policy);
    const messages = items.map((item) =>
      sanitizeContextItem(item, activePolicy),
    );
    const signals = [
      ...itemCountSignals(messages, activePolicy),
      ...contextSizeSignals(messages, activePolicy),
      ...items.flatMap((item, index) => itemSignals(item, index, activePolicy)),
    ];
    const decision = contextDecision(signals, activePolicy);
    this.events.record('model-context', context, decision, signals);
    return {
      decision,
      messages: decision === 'allow' ? messages : [],
      signals,
    };
  }

  prepareMemoryWrite(
    items: ModelContextItem[],
    context: ExecutionContext,
    policy: MemoryWritePolicy = defaultMemoryWritePolicy,
  ): PrepareModelContextResponse {
    const activePolicy = mergeMemoryWritePolicy(policy);
    const messages = items.map((item) =>
      sanitizeMemoryWriteItem(item, activePolicy),
    );
    const signals = [
      ...memoryItemCountSignals(messages, activePolicy),
      ...memorySizeSignals(messages, activePolicy),
      ...messages.flatMap((item, index) =>
        memorySourceSignals(item, index, activePolicy),
      ),
      ...items.flatMap((item, index) =>
        memoryItemSignals(item, index, activePolicy),
      ),
    ];
    const decision = contextDecision(signals, activePolicy);
    this.events.record('memory-write', context, decision, signals);
    return {
      decision,
      messages: decision === 'allow' ? messages : [],
      signals,
    };
  }
}

export function userContextItem(
  role: ContextItemRole,
  content: unknown,
): ModelContextItem {
  return {
    role,
    content,
    source: sourceForRole(role),
    trustedAsInstruction: false,
  };
}

function itemCountSignals(
  items: ModelContextItem[],
  policy: Required<ContextPolicy>,
): SecuritySignal[] {
  return items.length > policy.maxItems
    ? [blockSignal('context_item_limit_exceeded', '$.messages')]
    : [];
}

function contextSizeSignals(
  items: ModelContextItem[],
  policy: Required<ContextPolicy>,
): SecuritySignal[] {
  return jsonBytes(items) > policy.maxContextBytes
    ? [blockSignal('context_size_exceeded', '$.messages')]
    : [];
}

function memoryItemCountSignals(
  items: ModelContextItem[],
  policy: Required<MemoryWritePolicy>,
): SecuritySignal[] {
  return items.length > policy.maxItems
    ? [blockSignal('memory_item_limit_exceeded', '$.memories')]
    : [];
}

function memorySizeSignals(
  items: ModelContextItem[],
  policy: Required<MemoryWritePolicy>,
): SecuritySignal[] {
  return jsonBytes(items) > policy.maxMemoryBytes
    ? [blockSignal('memory_size_exceeded', '$.memories')]
    : [];
}

function memorySourceSignals(
  item: ModelContextItem,
  index: number,
  policy: Required<MemoryWritePolicy>,
): SecuritySignal[] {
  return policy.allowedSources.includes(item.source)
    ? []
    : [
        blockSignal(
          'memory_source_not_allowed',
          `$.memories.${String(index)}.source`,
        ),
      ];
}

function itemSignals(
  item: ModelContextItem,
  index: number,
  policy: Required<ContextPolicy>,
): SecuritySignal[] {
  return scanTextContent(item.content, {
    basePath: `$.messages.${String(index)}.content`,
    maxTextLength: policy.maxTextLength,
    textTooLargeCode: 'context_text_limit_exceeded',
  });
}

function memoryItemSignals(
  item: ModelContextItem,
  index: number,
  policy: Required<MemoryWritePolicy>,
): SecuritySignal[] {
  return scanTextContent(item.content, {
    basePath: `$.memories.${String(index)}.content`,
    maxTextLength: policy.maxTextLength,
    textTooLargeCode: 'memory_text_limit_exceeded',
  });
}

function contextDecision(
  signals: SecuritySignal[],
  policy: { quarantineOnScannerSignals: boolean },
): ReturnType<typeof securityDecisionFor> {
  return securityDecisionFor(signals, policy.quarantineOnScannerSignals);
}

function blockSignal(code: string, path: string): SecuritySignal {
  return {
    code,
    path,
    severity: 'block',
    category: 'budget',
    message: messageFor(code),
  };
}

function messageFor(code: string): string {
  return messages()[code] ?? 'Context guard blocked model input.';
}

function messages(): Record<string, string> {
  return {
    context_item_limit_exceeded: 'Context item count exceeds policy.',
    context_size_exceeded: 'Context size exceeds policy.',
    memory_item_limit_exceeded: 'Memory item count exceeds policy.',
    memory_size_exceeded: 'Memory write size exceeds policy.',
    memory_source_not_allowed:
      'Memory writes cannot persist content from this source.',
  };
}
