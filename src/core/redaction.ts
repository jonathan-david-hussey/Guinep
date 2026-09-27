import {
  cloneJson,
  deletePath,
  isRecord,
  readPath,
  writePath,
} from './path-utils.js';

const redactedValue = '[REDACTED]';

export function redactSecretLikeKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSecretLikeKeys);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      secretLikeKey(key) ? redactedValue : redactSecretLikeKeys(child),
    ]),
  );
}

export function redactValue(value: unknown, paths: string[]): unknown {
  const clone = cloneJson(value);
  if (Array.isArray(clone)) {
    return clone.map((item) => redactValue(item, paths));
  }

  for (const path of paths) {
    redactPath(clone, path);
  }

  return clone;
}

export function redactHeaders(
  headers: Record<string, string>,
  headerNames: string[],
): Record<string, string> {
  const blocked = new Set(headerNames.map(normalizeHeader));
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      blocked.has(normalizeHeader(name)) ? redactedValue : value,
    ]),
  );
}

export function redactQuery(url: URL, queryNames: string[]): URL {
  const clone = new URL(url.toString());
  for (const name of queryNames) {
    if (clone.searchParams.has(name)) {
      clone.searchParams.set(name, redactedValue);
    }
  }

  return clone;
}

export function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

function redactPath(value: unknown, path: string): void {
  if (path === '$') {
    return;
  }

  if (readPath(value, path) === undefined) {
    deletePath(value, path);
    return;
  }

  if (isRecord(value)) {
    writePath(value, path, redactedValue);
  }
}

function secretLikeKey(key: string): boolean {
  return /api[-_]?key|credential|password|secret|token/i.test(key);
}
