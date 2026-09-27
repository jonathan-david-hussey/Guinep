import {
  type ExecutionContext,
  type InvokeOperationResponse,
  type JsonObject,
  type OperationSpec,
  type SecuritySignal,
} from './contracts.js';
import { runtimeOperationId } from './response.service.js';
import { blockSignal } from './security-guard-signals.js';

const defaultMaxRequestBytes = 256_000;
const defaultMaxResponseBytes = 1_000_000;
const defaultMaxTextLength = 32_000;
const defaultMaxToolCallDepth = 4;

export function budgetSignals(
  spec: OperationSpec,
  input: JsonObject,
  context: ExecutionContext,
): SecuritySignal[] {
  return [
    ...byteBudgetSignal(input, requestBytesBudget(spec), 'request_too_large'),
    ...depthBudgetSignal(context, toolDepthBudget(spec)),
  ];
}

export function responseBudgetSignals(
  spec: OperationSpec,
  response: InvokeOperationResponse,
): SecuritySignal[] {
  return byteBudgetSignal(
    response.data,
    responseBytesBudget(spec),
    'response_too_large',
  );
}

export function textLengthBudget(spec: OperationSpec): number {
  return Math.min(
    spec.executionPolicy?.budgets?.maxTextLength ?? defaultMaxTextLength,
    defaultMaxTextLength,
  );
}

export function callBudgetSignals(
  counts: Map<string, number>,
  spec: OperationSpec,
  context: ExecutionContext,
): SecuritySignal[] {
  const limit = spec.executionPolicy?.budgets?.maxCallsPerRun;
  if (context.runId === undefined || limit === undefined) {
    return [];
  }

  const key = `${context.runId}:${runtimeOperationId(spec)}`;
  const next = (counts.get(key) ?? 0) + 1;
  counts.set(key, next);
  return next > limit
    ? [blockSignal('call_budget_exceeded', 'budget', '$.context.runId')]
    : [];
}

export function minuteBudgetSignals(
  counts: Map<string, number>,
  spec: OperationSpec,
  context: ExecutionContext,
): SecuritySignal[] {
  const limit = spec.executionPolicy?.budgets?.maxCallsPerMinute;
  if (limit === undefined) {
    return [];
  }

  const key = [
    currentMinute(),
    context.source,
    context.userId ?? 'anonymous',
    runtimeOperationId(spec),
  ].join(':');
  const next = (counts.get(key) ?? 0) + 1;
  counts.set(key, next);
  return next > limit
    ? [blockSignal('minute_call_budget_exceeded', 'budget', '$.context')]
    : [];
}

function requestBytesBudget(spec: OperationSpec): number {
  return Math.min(
    spec.executionPolicy?.budgets?.maxRequestBytes ?? defaultMaxRequestBytes,
    defaultMaxRequestBytes,
  );
}

function responseBytesBudget(spec: OperationSpec): number {
  return Math.min(
    spec.executionPolicy?.budgets?.maxResponseBytes ?? defaultMaxResponseBytes,
    defaultMaxResponseBytes,
  );
}

function toolDepthBudget(spec: OperationSpec): number {
  return Math.min(
    spec.executionPolicy?.budgets?.maxToolCallDepth ?? defaultMaxToolCallDepth,
    defaultMaxToolCallDepth,
  );
}

function byteBudgetSignal(
  value: unknown,
  limit: number | undefined,
  code: string,
): SecuritySignal[] {
  return limitExceeded(jsonBytes(value), limit)
    ? [blockSignal(code, 'budget', '$')]
    : [];
}

function depthBudgetSignal(
  context: ExecutionContext,
  limit: number | undefined,
): SecuritySignal[] {
  return limitExceeded(context.toolCallDepth ?? 0, limit)
    ? [
        blockSignal(
          'tool_call_depth_exceeded',
          'budget',
          '$.context.toolCallDepth',
        ),
      ]
    : [];
}

function currentMinute(): number {
  return Math.floor(Date.now() / 60_000);
}

function limitExceeded(value: number, limit: number | undefined): boolean {
  return limit !== undefined && value > limit;
}

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
}
