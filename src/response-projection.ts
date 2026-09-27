import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import {
  type JsonObject,
  type ResponseFilterRule,
  type ResponseSortRule,
  type ResponseTransformPolicy,
} from './core/contracts.js';
import { isRecord } from './core/path-utils.js';
import { applyResponseFilters } from './core/response-filter.js';
import { applyResponseSort } from './core/response-sort.js';

export interface ResponseProjection {
  include: string[];
}

export interface ResponseControls {
  projection?: ResponseProjection;
  filters?: ResponseFilterRule[];
  sort?: ResponseSortRule[];
  limit?: number;
}

@Injectable()
export class ResponseProjectionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const controls = responseControlsFromRequest(httpRequest(context));
    return next
      .handle()
      .pipe(
        map((response: unknown) => applyResponseControls(response, controls)),
      );
  }
}

export function applyResponseControls(
  response: unknown,
  controls: ResponseControls | undefined,
): unknown {
  if (controls === undefined) {
    return response;
  }

  const filtered = applyNestedFilters(response, controls.filters);
  const sorted = applyNestedSort(filtered, controls.sort);
  const limited = applyNestedLimit(sorted, controls.limit);
  return applyResponseProjection(limited, controls.projection);
}

export function applyResponseProjection(
  response: unknown,
  projection: ResponseProjection | undefined,
): unknown {
  if (projection === undefined || !isRecord(response)) {
    return response;
  }

  const result: JsonObject = {};
  for (const path of projection.include) {
    copyProjectedPath(response, result, projectionSegments(path));
  }

  return result;
}

export function projectionFromRequest(
  request: ProjectionHttpRequest,
): ResponseProjection | undefined {
  return responseControlsFromRequest(request)?.projection;
}

export function responseControlsFromRequest(
  request: ProjectionHttpRequest,
): ResponseControls | undefined {
  const controls: ResponseControls = {};
  applyBodyControls(request.body, controls);
  applyMcpParamControls(request.body, controls);
  applyQueryControls(request.query, controls);
  return hasControls(controls) ? controls : undefined;
}

interface ProjectionHttpRequest {
  body?: unknown;
  query?: unknown;
}

function httpRequest(context: ExecutionContext): ProjectionHttpRequest {
  return context.switchToHttp().getRequest<ProjectionHttpRequest>();
}

function applyBodyControls(body: unknown, controls: ResponseControls): void {
  if (!isRecord(body)) {
    return;
  }

  applyConfigControls(body, controls);
}

function applyMcpParamControls(
  body: unknown,
  controls: ResponseControls,
): void {
  if (!isRecord(body) || !isRecord(body['params'])) {
    return;
  }

  applyConfigControls(body['params'], controls);
}

function applyQueryControls(query: unknown, controls: ResponseControls): void {
  if (!isRecord(query)) {
    return;
  }

  assignProjection(controls, projectionFromIncludeValue(query['include']));
}

function applyConfigControls(
  config: JsonObject,
  controls: ResponseControls,
): void {
  const policy = responsePolicyFromConfig(config);
  assignProjection(
    controls,
    projectionFromConfig(config['projection'] ?? config['filter']),
  );
  assignProjection(controls, projectionFromConfig(policy));
  assignFilters(
    controls,
    filtersFromConfig(config['filters'] ?? policy?.filters),
  );
  assignSort(controls, sortFromConfig(config['sort'] ?? policy?.sort));
  assignLimit(controls, limitFromConfig(config['limit'] ?? policy));
}

function responsePolicyFromConfig(
  config: JsonObject,
): ResponseTransformPolicy | undefined {
  const policy = config['responsePolicy'];
  if (!isRecord(policy)) {
    return undefined;
  }

  return isRecord(policy['success']) ? policy['success'] : undefined;
}

function projectionFromConfig(value: unknown): ResponseProjection | undefined {
  return isRecord(value)
    ? projectionFromIncludeValue(value['include'])
    : undefined;
}

function projectionFromIncludeValue(
  value: unknown,
): ResponseProjection | undefined {
  const include = includePaths(value);
  return include.length === 0 ? undefined : { include };
}

function includePaths(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((path) => path.trim())
      .filter(Boolean);
  }

  return Array.isArray(value)
    ? value.filter((path): path is string => typeof path === 'string')
    : [];
}

function filtersFromConfig(value: unknown): ResponseFilterRule[] | undefined {
  return Array.isArray(value) ? value.filter(isResponseFilterRule) : undefined;
}

function isResponseFilterRule(value: unknown): value is ResponseFilterRule {
  return isRecord(value) && typeof value['path'] === 'string';
}

function sortFromConfig(value: unknown): ResponseSortRule[] | undefined {
  return Array.isArray(value) ? value.filter(isResponseSortRule) : undefined;
}

function isResponseSortRule(value: unknown): value is ResponseSortRule {
  return isRecord(value) && typeof value['path'] === 'string';
}

function limitFromConfig(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (isRecord(value)) {
    return limitFromConfig(value['limit'] ?? value['maxItems']);
  }

  return undefined;
}

function assignProjection(
  controls: ResponseControls,
  projection: ResponseProjection | undefined,
): void {
  if (projection !== undefined) {
    controls.projection = projection;
  }
}

function assignFilters(
  controls: ResponseControls,
  filters: ResponseFilterRule[] | undefined,
): void {
  if (filters !== undefined) {
    controls.filters = filters;
  }
}

function assignSort(
  controls: ResponseControls,
  sort: ResponseSortRule[] | undefined,
): void {
  if (sort !== undefined) {
    controls.sort = sort;
  }
}

function assignLimit(
  controls: ResponseControls,
  limit: number | undefined,
): void {
  if (limit !== undefined) {
    controls.limit = limit;
  }
}

function hasControls(controls: ResponseControls): boolean {
  return (
    controls.projection !== undefined ||
    controls.filters !== undefined ||
    controls.sort !== undefined ||
    controls.limit !== undefined
  );
}

function applyNestedFilters(
  response: unknown,
  filters: ResponseFilterRule[] | undefined,
): unknown {
  if (filters === undefined) {
    return response;
  }

  if (isRecord(response) && 'result' in response) {
    return {
      ...response,
      result: transformNestedArrays(response['result'], (items) =>
        applyResponseFilters(items, filters) as unknown[],
      ),
    };
  }

  return transformNestedArrays(
    response,
    (items) => applyResponseFilters(items, filters) as unknown[],
  );
}

function applyNestedSort(
  response: unknown,
  sort: ResponseSortRule[] | undefined,
): unknown {
  if (sort === undefined) {
    return response;
  }

  return transformNestedArrays(
    response,
    (items) => applyResponseSort(items, sort) as unknown[],
  );
}

function applyNestedLimit(
  response: unknown,
  limit: number | undefined,
): unknown {
  if (limit === undefined) {
    return response;
  }

  return transformNestedArrays(response, (items) => items.slice(0, limit));
}

function transformNestedArrays(
  value: unknown,
  transform: (items: unknown[]) => unknown[],
): unknown {
  if (Array.isArray(value)) {
    return transform(value).map((item) =>
      transformNestedArrays(item, transform),
    );
  }

  if (!isRecord(value)) {
    return value;
  }

  const result: JsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = transformNestedArrays(child, transform);
  }

  return result;
}

function projectionSegments(path: string): string[] {
  const normalized = path.startsWith('$.') ? path.slice(2) : path;
  return normalized
    .replaceAll('[i]', '')
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function copyProjectedPath(
  source: unknown,
  target: unknown,
  segments: string[],
): void {
  const segment = segments[0];
  if (segment === undefined) {
    return;
  }

  if (Array.isArray(source) && Array.isArray(target)) {
    copyArrayProjection(source, target, segments);
    return;
  }

  if (!isRecord(source) || !isRecord(target) || !(segment in source)) {
    return;
  }

  copyRecordProjection(source, target, segment, segments.slice(1));
}

function copyArrayProjection(
  source: unknown[],
  target: unknown[],
  segments: string[],
): void {
  source.forEach((item, index) => {
    const child = ensureArrayChild(target, index);
    copyProjectedPath(item, child, segments);
  });
}

function copyRecordProjection(
  source: JsonObject,
  target: JsonObject,
  segment: string,
  remaining: string[],
): void {
  if (remaining.length === 0) {
    target[segment] = source[segment];
    return;
  }

  const child = source[segment];
  const nextTarget = ensureChild(target, segment, child);
  copyProjectedPath(child, nextTarget, remaining);
}

function ensureChild(
  target: JsonObject,
  segment: string,
  sourceChild: unknown,
): JsonObject | unknown[] {
  const existing = target[segment];
  if (Array.isArray(existing) || isRecord(existing)) {
    return existing;
  }

  const next = Array.isArray(sourceChild) ? [] : {};
  target[segment] = next;
  return next;
}

function ensureArrayChild(target: unknown[], index: number): JsonObject {
  const existing = target[index];
  if (isRecord(existing)) {
    return existing;
  }

  const next: JsonObject = {};
  target[index] = next;
  return next;
}
