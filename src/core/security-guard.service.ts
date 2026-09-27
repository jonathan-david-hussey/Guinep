import { Injectable } from '@nestjs/common';
import {
  type ApprovalPreview,
  type ExecutionContext,
  type InvokeOperationResponse,
  type JsonObject,
  type MappedHttpRequest,
  type OperationSpec,
  type SecurityDecision,
  type SecuritySignal,
  type ValidationFailure,
} from './contracts.js';
import { runtimeOperationId } from './response.service.js';
import { SecurityEventService } from './security-event.service.js';
import { scanTextContent } from './security-scanner.js';
import { hasPath } from './path-utils.js';
import { approvalPreview, approvalSignals } from './security-guard-approval.js';
import {
  budgetSignals,
  callBudgetSignals,
  minuteBudgetSignals,
  responseBudgetSignals,
  textLengthBudget,
} from './security-guard-budgets.js';
import { decisionFor, failuresFor } from './security-guard-decision.js';
import {
  quarantined,
  responseDecisionFor,
  withContextSafety,
} from './security-guard-response.js';
import { blockSignal } from './security-guard-signals.js';

export type SecurityGuardResult =
  | { ok: true; signals: SecuritySignal[] }
  | { ok: false; failures: ValidationFailure[]; decision: SecurityDecision };

@Injectable()
export class SecurityGuardService {
  private readonly callCounts = new Map<string, number>();
  private readonly minuteCallCounts = new Map<string, number>();

  public constructor(private readonly events: SecurityEventService) {}

  beforeInvoke(
    spec: OperationSpec,
    input: JsonObject,
    context: ExecutionContext,
  ): SecurityGuardResult {
    const signals = [
      ...sourceSignals(spec, context),
      ...capabilitySignals(spec, context),
      ...effectDeclarationSignals(spec, context),
      ...groundingSignals(spec, input),
      ...budgetSignals(spec, input, context),
      ...scannerSignals(input, textLengthBudget(spec)),
      ...callBudgetSignals(this.callCounts, spec, context),
      ...minuteBudgetSignals(this.minuteCallCounts, spec, context),
    ];

    return this.evaluate(runtimeOperationId(spec), context, signals);
  }

  beforeDispatch(
    spec: OperationSpec,
    request: MappedHttpRequest,
    context: ExecutionContext,
    redactedHeaders: string[],
    redactedQuery: string[],
  ): SecurityGuardResult {
    const signals = approvalSignals(spec, context);
    const preview = approvalPreview(
      spec,
      request,
      redactedHeaders,
      redactedQuery,
    );
    return this.evaluate(runtimeOperationId(spec), context, signals, preview);
  }

  afterResponse(
    spec: OperationSpec,
    response: InvokeOperationResponse,
    context: ExecutionContext,
  ): InvokeOperationResponse {
    const signals = [
      ...responseBudgetSignals(spec, response),
      ...scannerSignals(response.data, textLengthBudget(spec)),
    ];
    const decision = responseDecisionFor(signals);
    this.events.record(runtimeOperationId(spec), context, decision, signals);
    return decision === 'allow'
      ? withContextSafety(response, signals)
      : quarantined(spec, signals);
  }

  private evaluate(
    operationId: string,
    context: ExecutionContext,
    signals: SecuritySignal[],
    approvalPreview?: ApprovalPreview,
  ): SecurityGuardResult {
    const decision = decisionFor(signals);
    this.events.record(operationId, context, decision, signals);
    return decision === 'allow'
      ? { ok: true, signals }
      : {
          ok: false,
          decision,
          failures: failuresFor(
            signals,
            decision === 'require_approval' ? approvalPreview : undefined,
          ),
        };
  }
}

function sourceSignals(
  spec: OperationSpec,
  context: ExecutionContext,
): SecuritySignal[] {
  const allowed = spec.executionPolicy?.allowedSources;
  if (allowed === undefined || allowed.includes(context.source)) {
    return [];
  }

  return [blockSignal('source_not_allowed', 'policy', '$.context.source')];
}

function capabilitySignals(
  spec: OperationSpec,
  context: ExecutionContext,
): SecuritySignal[] {
  return missingCapabilities(spec, context).map((capability) =>
    blockSignal(
      `missing_capability:${capability}`,
      'capability',
      '$.context.capabilities',
    ),
  );
}

function missingCapabilities(
  spec: OperationSpec,
  context: ExecutionContext,
): string[] {
  const current = new Set(context.capabilities ?? []);
  return (spec.executionPolicy?.requiredCapabilities ?? []).filter(
    (capability) => !current.has(capability),
  );
}

function effectDeclarationSignals(
  spec: OperationSpec,
  context: ExecutionContext,
): SecuritySignal[] {
  if (
    !isAgenticSource(context.source) ||
    !isMutatingMethod(spec.request.method) ||
    (spec.executionPolicy?.effects ?? []).length > 0
  ) {
    return [];
  }

  return [
    blockSignal('effects_not_declared', 'policy', '$.executionPolicy.effects'),
  ];
}

function isMutatingMethod(method: OperationSpec['request']['method']): boolean {
  return method !== 'GET';
}

function groundingSignals(
  spec: OperationSpec,
  input: JsonObject,
): SecuritySignal[] {
  return (spec.executionPolicy?.requiredGroundingPaths ?? [])
    .filter((path) => !hasPath(input, path))
    .map((path) => blockSignal('grounding_required', 'policy', path));
}

function isAgenticSource(source: ExecutionContext['source']): boolean {
  return source !== 'api';
}

function scannerSignals(
  value: unknown,
  maxTextLength: number | undefined,
): SecuritySignal[] {
  const options = { textTooLargeCode: 'text_too_large' };
  return maxTextLength === undefined
    ? scanTextContent(value, options)
    : scanTextContent(value, { ...options, maxTextLength });
}
