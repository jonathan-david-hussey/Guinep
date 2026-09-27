import {
  type ApprovalPreview,
  type ExecutionContext,
  type MappedHttpRequest,
  type OperationSpec,
  type SecuritySignal,
} from './contracts.js';
import {
  redactHeaders,
  redactQuery,
  redactSecretLikeKeys,
  redactValue,
} from './redaction.js';
import { runtimeOperationId } from './response.service.js';

export function approvalSignals(
  spec: OperationSpec,
  context: ExecutionContext,
): SecuritySignal[] {
  const approval = spec.executionPolicy?.approval;
  if (approval === undefined || approval.mode === 'never') {
    return [];
  }

  if (approval.mode === 'ruleOfTwo' && !ruleOfTwoApplies(spec, context)) {
    return [];
  }

  return [
    {
      code:
        approval.mode === 'ruleOfTwo'
          ? 'rule_of_two_approval_required'
          : 'approval_required',
      message: approval.reason ?? approvalMessage(approval.mode),
      severity: 'block',
      category: 'approval',
      path: '$.executionPolicy.approval',
    },
  ];
}

export function approvalPreview(
  spec: OperationSpec,
  request: MappedHttpRequest,
  redactedHeaders: string[],
  redactedQuery: string[],
): ApprovalPreview {
  const preview = {
    operationId: runtimeOperationId(spec),
    method: request.method,
    url: redactQuery(request.url, redactedQuery).toString(),
    headers: redactHeaders(request.headers, redactedHeaders),
  };

  if (request.body === undefined) {
    return preview;
  }

  return {
    ...preview,
    body: redactSecretLikeKeys(
      redactValue(request.body, spec.securityPolicy.redactedRequestPaths),
    ),
  };
}

function ruleOfTwoApplies(
  spec: OperationSpec,
  context: ExecutionContext,
): boolean {
  return (
    isAgenticSource(context.source) &&
    hasExternalSideEffect(spec.executionPolicy?.effects ?? []) &&
    handlesSensitiveData(spec.executionPolicy?.dataClasses ?? {})
  );
}

function isAgenticSource(source: ExecutionContext['source']): boolean {
  return source !== 'api';
}

function hasExternalSideEffect(effects: string[]): boolean {
  const knownEffects = new Set([
    'create',
    'delete',
    'email_send',
    'external_message',
    'external_write',
    'payment',
    'send',
    'state_change',
    'ticket_create',
    'update',
    'write',
  ]);
  return effects.some((effect) => knownEffects.has(effect));
}

function handlesSensitiveData(dataClasses: Record<string, string[]>): boolean {
  const sensitiveClasses = new Set([
    'credential',
    'financial',
    'health',
    'payment',
    'pii',
    'private',
    'secret',
  ]);
  return Object.values(dataClasses).some((classes) =>
    classes.some((dataClass) => sensitiveClasses.has(dataClass)),
  );
}

function approvalMessage(mode: 'always' | 'ruleOfTwo'): string {
  return mode === 'ruleOfTwo'
    ? 'Approval is required when untrusted agent context can combine sensitive data with an external side effect.'
    : 'Approval is required.';
}
