import {
  type ErrorRule,
  type OperationSpec,
  type UpstreamResult,
} from './contracts.js';
import { isRecord, readPath } from './path-utils.js';

type UpstreamFailure = Exclude<UpstreamResult, { ok: true }>;

export function matchingErrorRule(
  spec: OperationSpec,
  result: UpstreamFailure,
): ErrorRule | undefined {
  return spec.responsePolicy.error?.rules.find((rule) =>
    ruleMatches(rule, result),
  );
}

export function responseStatus(rule: ErrorRule | undefined): number {
  return rule?.behavior === 'return' || rule?.behavior === 'retry_then_return'
    ? 200
    : 502;
}

export function defaultErrorCode(result: UpstreamFailure): string {
  return result.failureKind === 'http'
    ? 'upstream_http_error'
    : `upstream_${result.failureKind}`;
}

export function defaultErrorMessage(result: UpstreamFailure): string {
  return result.failureKind === 'http'
    ? 'The upstream service returned an error.'
    : 'The upstream service could not be reached.';
}

function ruleMatches(rule: ErrorRule, result: UpstreamFailure): boolean {
  return (
    statusMatches(rule, result.status) &&
    failureKindMatches(rule, result.failureKind) &&
    bodyMatches(rule, result.body)
  );
}

function statusMatches(rule: ErrorRule, status: number | undefined): boolean {
  if (rule.status === undefined && rule.statusRange === undefined) {
    return true;
  }

  return exactStatusMatches(rule, status) || statusInRange(status, rule);
}

function exactStatusMatches(
  rule: ErrorRule,
  status: number | undefined,
): boolean {
  return rule.status !== undefined && rule.status === status;
}

function statusInRange(status: number | undefined, rule: ErrorRule): boolean {
  if (status === undefined || rule.statusRange === undefined) {
    return false;
  }

  return status >= rule.statusRange.min && status <= rule.statusRange.max;
}

function failureKindMatches(rule: ErrorRule, failureKind: string): boolean {
  return rule.failureKind === undefined || rule.failureKind === failureKind;
}

function bodyMatches(rule: ErrorRule, body: unknown): boolean {
  if (rule.bodyPath === undefined) {
    return true;
  }

  return isRecord(body) && readPath(body, rule.bodyPath) === rule.bodyEquals;
}
