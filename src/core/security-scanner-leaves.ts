import { isRecord } from './path-utils.js';

export interface TextLeaf {
  path: string;
  value: string;
}

export function textLeaves(value: unknown, path: string): TextLeaf[] {
  if (typeof value === 'string') {
    return [{ path, value }];
  }

  if (Array.isArray(value)) {
    return value.flatMap((child, index) =>
      textLeaves(child, `${path}.${String(index)}`),
    );
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    textLeaves(child, `${path}.${key}`),
  );
}
