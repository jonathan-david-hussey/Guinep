import {
  type JsonObject,
  type MappingRule,
  type ValidationFailure,
} from './contracts.js';
import { hasPath, readPath } from './path-utils.js';

export type ResolvedValue =
  { ok: true; value: unknown } | { ok: false; failure: ValidationFailure };

export function resolveMappingValue(
  rule: MappingRule,
  input: JsonObject,
): ResolvedValue {
  if (!hasPath(input, rule.from) && rule.defaultValue === undefined) {
    return missingValue(rule);
  }

  const value = hasPath(input, rule.from)
    ? readPath(input, rule.from)
    : rule.defaultValue;
  return transformValue(rule, value);
}

export function toScalarValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
}

function missingValue(rule: MappingRule): ResolvedValue {
  if (rule.required === true) {
    return {
      ok: false,
      failure: {
        path: rule.from,
        code: 'mapping_required',
        message: `Required mapping source ${rule.from} is missing.`,
      },
    };
  }

  return { ok: true, value: undefined };
}

function transformValue(rule: MappingRule, value: unknown): ResolvedValue {
  if (value === undefined || rule.transform === undefined) {
    return { ok: true, value };
  }

  const transformed = convertValue(rule.transform, value);
  if (transformed.ok) {
    return transformed;
  }

  return {
    ok: false,
    failure: {
      path: rule.from,
      code: 'invalid_transform',
      message: `Cannot transform ${rule.from} to ${rule.transform}.`,
    },
  };
}

function convertValue(
  transform: MappingRule['transform'],
  value: unknown,
): { ok: true; value: unknown } | { ok: false } {
  switch (transform) {
    case 'string':
      return { ok: true, value: String(value) };
    case 'number':
      return convertNumber(value, false);
    case 'integer':
      return convertNumber(value, true);
    case 'boolean':
      return convertBoolean(value);
    case 'jsonStringify':
      return { ok: true, value: JSON.stringify(value) };
    case undefined:
      return { ok: true, value };
  }
}

function convertNumber(
  value: unknown,
  requireInteger: boolean,
): { ok: true; value: number } | { ok: false } {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return { ok: false };
  }

  if (requireInteger && !Number.isInteger(numberValue)) {
    return { ok: false };
  }

  return { ok: true, value: numberValue };
}

function convertBoolean(
  value: unknown,
): { ok: true; value: boolean } | { ok: false } {
  if (typeof value === 'boolean') {
    return { ok: true, value };
  }

  if (value === 'true' || value === 'false') {
    return { ok: true, value: value === 'true' };
  }

  return { ok: false };
}
