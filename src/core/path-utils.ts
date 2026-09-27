import { type JsonObject } from './contracts.js';

export function readPath(source: unknown, path: string): unknown {
  if (path === '$') {
    return source;
  }

  return pathSegments(path).reduce<unknown>(readSegment, source);
}

export function hasPath(source: unknown, path: string): boolean {
  if (path === '$') {
    return true;
  }

  let current = source;
  for (const segment of pathSegments(path)) {
    if (!isRecord(current) || !(segment in current)) {
      return false;
    }

    current = current[segment];
  }

  return true;
}

export function writePath(
  target: JsonObject,
  path: string,
  value: unknown,
): void {
  const segments = pathSegments(path);
  const lastSegment = segments.at(-1);

  if (lastSegment === undefined) {
    return;
  }

  const parent = ensureParent(target, segments.slice(0, -1));
  parent[lastSegment] = value;
}

export function deletePath(target: unknown, path: string): void {
  const segments = pathSegments(path);
  const lastSegment = segments.at(-1);

  if (lastSegment === undefined) {
    return;
  }

  const parent = readParent(target, segments.slice(0, -1));
  if (parent !== undefined) {
    const replacement = Object.fromEntries(
      Object.entries(parent).filter(([key]) => key !== lastSegment),
    );
    replaceObject(parent, replacement);
  }
}

export function cloneJson(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as unknown;
}

export function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function pathSegments(path: string): string[] {
  if (path === '$') {
    return [];
  }

  if (!path.startsWith('$.')) {
    return [];
  }

  return path.slice(2).split('.').filter(Boolean);
}

function readSegment(current: unknown, segment: string): unknown {
  if (!isRecord(current)) {
    return undefined;
  }

  return current[segment];
}

function ensureParent(target: JsonObject, segments: string[]): JsonObject {
  let current = target;
  for (const segment of segments) {
    current = ensureChild(current, segment);
  }

  return current;
}

function ensureChild(target: JsonObject, segment: string): JsonObject {
  const child = target[segment];
  if (isRecord(child)) {
    return child;
  }

  const next: JsonObject = {};
  target[segment] = next;
  return next;
}

function readParent(
  target: unknown,
  segments: string[],
): JsonObject | undefined {
  let current = target;
  for (const segment of segments) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return isRecord(current) ? current : undefined;
}

function replaceObject(target: JsonObject, replacement: JsonObject): void {
  for (const key of Object.keys(target)) {
    Reflect.deleteProperty(target, key);
  }

  Object.assign(target, replacement);
}
