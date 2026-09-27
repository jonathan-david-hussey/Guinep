import { type ResponseFilterRule } from './contracts.js';
import { hasPath, readPath } from './path-utils.js';

export function applyResponseFilters(
  body: unknown,
  filters: ResponseFilterRule[] | undefined,
): unknown {
  if (filters === undefined || !Array.isArray(body)) {
    return body;
  }

  return body.filter((item) =>
    filters.every((rule) => filterMatches(item, rule)),
  );
}

function filterMatches(item: unknown, rule: ResponseFilterRule): boolean {
  const exists = hasPath(item, rule.path);
  return (
    existsMatches(exists, rule) &&
    equalsMatches(item, rule) &&
    notEqualsMatches(item, rule)
  );
}

function existsMatches(exists: boolean, rule: ResponseFilterRule): boolean {
  return rule.exists === undefined || rule.exists === exists;
}

function equalsMatches(item: unknown, rule: ResponseFilterRule): boolean {
  return rule.equals === undefined || readPath(item, rule.path) === rule.equals;
}

function notEqualsMatches(item: unknown, rule: ResponseFilterRule): boolean {
  return (
    rule.notEquals === undefined || readPath(item, rule.path) !== rule.notEquals
  );
}
