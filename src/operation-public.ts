import { createHash } from 'node:crypto';
import { type OperationSpec, type ToolSchema } from './core/contracts.js';
import { runtimeOperationId } from './core/response.service.js';
import { type ToolSchemaService } from './core/tool-schema.service.js';

export function publicOperation(
  spec: OperationSpec,
  schemas: ToolSchemaService,
): {
  operationId: string;
  id: string;
  version: string;
  displayName?: string;
  toolSchema: ToolSchema;
  integrity: { sha256: string };
} {
  return {
    operationId: runtimeOperationId(spec),
    id: spec.id,
    version: spec.version,
    ...(spec.displayName === undefined
      ? {}
      : { displayName: spec.displayName }),
    toolSchema: schemas.toToolSchema(spec),
    integrity: { sha256: specHash(spec) },
  };
}

function specHash(spec: OperationSpec): string {
  return createHash('sha256').update(stableJson(spec)).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }

  if (isPlainRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
