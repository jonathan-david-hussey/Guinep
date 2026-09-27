import { type ResponseSortRule } from './contracts.js';
import { readPath } from './path-utils.js';

export function applyResponseSort(
  body: unknown,
  rules: ResponseSortRule[] | undefined,
): unknown {
  if (rules === undefined || !Array.isArray(body)) {
    return body;
  }

  return body.slice().sort((left, right) => compareItems(left, right, rules));
}

function compareItems(
  left: unknown,
  right: unknown,
  rules: ResponseSortRule[],
): number {
  for (const rule of rules) {
    const compared = compareValues(
      readPath(left, rule.path),
      readPath(right, rule.path),
      rule,
    );
    if (compared !== 0) {
      return compared;
    }
  }

  return 0;
}

function compareValues(
  left: unknown,
  right: unknown,
  rule: ResponseSortRule,
): number {
  const compared =
    rule.type === 'number'
      ? numericCompare(left, right)
      : stringCompare(left, right);
  return rule.direction === 'desc' ? -compared : compared;
}

function numericCompare(left: unknown, right: unknown): number {
  return numberValue(left) - numberValue(right);
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function stringCompare(left: unknown, right: unknown): number {
  return stringValue(left).localeCompare(stringValue(right));
}

function stringValue(value: unknown): string {
  return isScalar(value) ? String(value) : '';
}

function isScalar(value: unknown): value is string | number | boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}
