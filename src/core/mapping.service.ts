import { Injectable } from '@nestjs/common';
import {
  type ConnectionSpec,
  type JsonObject,
  type MappedHttpRequest,
  type MappingRule,
  type OperationSpec,
  type ValidationFailure,
} from './contracts.js';
import { normalizeHeader } from './redaction.js';
import { isRecord, writePath } from './path-utils.js';
import { resolveMappingValue, toScalarValue } from './mapping-values.js';

export type MappingResult =
  | { ok: true; request: MappedHttpRequest }
  | { ok: false; failures: ValidationFailure[] };

@Injectable()
export class MappingService {
  mapRequest(
    spec: OperationSpec,
    input: JsonObject,
    connection: ConnectionSpec,
  ): MappingResult {
    const state = createMappingState(spec, connection);
    const failures = applyMappings(state, spec.request.mappings, input);

    if (failures.length > 0) {
      return { ok: false, failures };
    }

    const request = createMappedRequest(spec, state);
    return { ok: true, request };
  }
}

interface MappingState {
  url: URL;
  headers: Record<string, string>;
  body: JsonObject;
  pathValues: Record<string, string>;
}

function createMappingState(
  spec: OperationSpec,
  connection: ConnectionSpec,
): MappingState {
  return {
    url: new URL(spec.request.path, connection.baseUrl),
    headers: {},
    body: {},
    pathValues: {},
  };
}

function applyMappings(
  state: MappingState,
  rules: MappingRule[],
  input: JsonObject,
): ValidationFailure[] {
  return rules.flatMap((rule) => applyMapping(state, rule, input));
}

function applyMapping(
  state: MappingState,
  rule: MappingRule,
  input: JsonObject,
): ValidationFailure[] {
  const resolved = resolveMappingValue(rule, input);
  if (!resolved.ok) {
    return [resolved.failure];
  }

  writeMappingValue(state, rule.to, resolved.value);
  return [];
}

function writeMappingValue(
  state: MappingState,
  destination: string,
  value: unknown,
): void {
  if (value === undefined) {
    return;
  }

  const normalizedDestination = destination.toLowerCase();
  if (normalizedDestination.startsWith('path.')) {
    state.pathValues[destination.slice(5)] = toScalarValue(value);
    return;
  }

  writeNonPathValue(state, destination, value);
}

function writeNonPathValue(
  state: MappingState,
  destination: string,
  value: unknown,
): void {
  const normalizedDestination = destination.toLowerCase();
  if (normalizedDestination.startsWith('query.')) {
    state.url.searchParams.set(destination.slice(6), toScalarValue(value));
  } else if (normalizedDestination.startsWith('header.')) {
    state.headers[destination.slice(7)] = toHeaderValue(value);
  } else if (normalizedDestination.startsWith('body.')) {
    writePath(state.body, `$.${destination.slice(5)}`, value);
  }
}

function createMappedRequest(
  spec: OperationSpec,
  state: MappingState,
): MappedHttpRequest {
  return {
    method: spec.request.method,
    url: applyPathValues(state.url, state.pathValues),
    headers: state.headers,
    body: bodyOrUndefined(state.body),
    contentType: spec.request.contentType ?? 'json',
    timeoutMs: spec.request.timeoutMs ?? 5_000,
  };
}

function applyPathValues(url: URL, values: Record<string, string>): URL {
  const next = new URL(url.toString());
  let pathname = decodeURIComponent(next.pathname);
  for (const [key, value] of Object.entries(values)) {
    pathname = pathname.replace(`{${key}}`, encodeURIComponent(value));
  }

  next.pathname = pathname;
  return next;
}

function bodyOrUndefined(body: JsonObject): JsonObject | undefined {
  return isRecord(body) && Object.keys(body).length > 0 ? body : undefined;
}

function toHeaderValue(value: unknown): string {
  return toScalarValue(value);
}

export function isBlockedHeader(
  headerName: string,
  blockedHeaders: string[],
): boolean {
  const blocked = new Set(blockedHeaders.map(normalizeHeader));
  return blocked.has(normalizeHeader(headerName));
}
