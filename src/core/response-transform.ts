import { type MappingRule, type ResponseTransformPolicy } from './contracts.js';
import {
  cloneJson,
  deletePath,
  hasPath,
  readPath,
  writePath,
} from './path-utils.js';
import { redactValue } from './redaction.js';
import { applyResponseFilters } from './response-filter.js';
import { applyResponseSort } from './response-sort.js';
import {
  activeResponseTransformPolicy,
  type ActiveResponseTransformPolicy,
} from './response-transform-policy.js';

export function applyResponseTransform(
  body: unknown,
  policy: ResponseTransformPolicy | undefined,
): unknown {
  const unwrapped = unwrapBody(body, policy);
  return transformUnwrappedBody(
    unwrapped,
    activeResponseTransformPolicy(policy),
  );
}

function unwrapBody(
  body: unknown,
  policy: ResponseTransformPolicy | undefined,
): unknown {
  return policy?.unwrap === undefined ? body : readPath(body, policy.unwrap);
}

function transformUnwrappedBody(
  body: unknown,
  policy: ActiveResponseTransformPolicy,
): unknown {
  const filtered = applyResponseFilters(body, policy.filters);
  const sorted = applyResponseSort(filtered, policy.sort);
  const selected = applyInclude(sorted, policy.include);
  const withoutExcluded = applyExclude(selected, policy.exclude);
  const redacted = redactValue(withoutExcluded, policy.redact);
  const mapped = applyMappings(redacted, policy.mappings);
  return applyLimit(mapped, policy.limit);
}

function applyInclude(body: unknown, include: string[] | undefined): unknown {
  if (include === undefined) {
    return cloneJson(body);
  }

  if (Array.isArray(body)) {
    return body.map((item) => applyInclude(item, include));
  }

  const result: Record<string, unknown> = {};
  for (const path of include) {
    if (hasPath(body, path)) {
      writePath(result, path, readPath(body, path));
    }
  }

  return result;
}

function applyExclude(body: unknown, exclude: string[]): unknown {
  if (Array.isArray(body)) {
    return body.map((item) => applyExclude(item, exclude));
  }

  const result = cloneJson(body);
  for (const path of exclude) {
    deletePath(result, path);
  }

  return result;
}

function applyMappings(
  body: unknown,
  mappings: MappingRule[] | undefined,
): unknown {
  if (mappings === undefined) {
    return body;
  }

  const result: Record<string, unknown> = {};
  for (const mapping of mappings) {
    writeResponseMapping(result, mapping, body);
  }

  return result;
}

function writeResponseMapping(
  result: Record<string, unknown>,
  mapping: MappingRule,
  body: unknown,
): void {
  if (hasPath(body, mapping.from)) {
    writePath(result, mapping.to, readPath(body, mapping.from));
  }
}

function applyLimit(body: unknown, limit: number | undefined): unknown {
  return limit === undefined || !Array.isArray(body)
    ? body
    : body.slice(0, limit);
}
