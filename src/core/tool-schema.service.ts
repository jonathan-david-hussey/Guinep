import { Injectable } from '@nestjs/common';
import {
  type JsonObject,
  type JsonSchema,
  type OperationSpec,
  type ToolSchema,
} from './contracts.js';
import { cloneJson, isRecord, pathSegments } from './path-utils.js';

@Injectable()
export class ToolSchemaService {
  toToolSchema(spec: OperationSpec): ToolSchema {
    const inputSchema = reducedInputSchema(spec);
    const schema: ToolSchema = {
      operationId: `${spec.id}.${spec.version}`,
      name: spec.toolPolicy?.name ?? defaultToolName(spec),
      inputSchema,
      propertyOrder: propertyOrder(spec, inputSchema),
      examples: cloneExamples(spec.toolPolicy?.examples),
    };

    const description = spec.toolPolicy?.description ?? spec.displayName;
    if (description !== undefined) {
      schema.description = description;
    }

    return schema;
  }
}

function reducedInputSchema(spec: OperationSpec): JsonSchema {
  const schema = cloneJson(spec.inputSchema) as JsonSchema;
  for (const path of spec.toolPolicy?.hiddenInputPaths ?? []) {
    deleteSchemaPath(schema, pathSegments(path));
  }

  return schema;
}

function deleteSchemaPath(schema: unknown, segments: string[]): void {
  const segment = segments.at(0);
  if (segment === undefined || !isRecord(schema)) {
    return;
  }

  if (segments.length === 1) {
    deleteTopLevelProperty(schema, segment);
    return;
  }

  deleteSchemaPath(childSchema(schema, segment), segments.slice(1));
}

function childSchema(schema: JsonObject, segment: string): unknown {
  const properties = schema['properties'];
  if (!isRecord(properties)) {
    return undefined;
  }

  return properties[segment];
}

function deleteTopLevelProperty(schema: JsonObject, property: string): void {
  const properties = schema['properties'];
  if (isRecord(properties)) {
    Reflect.deleteProperty(properties, property);
  }

  removeRequiredProperty(schema, property);
}

function removeRequiredProperty(schema: JsonObject, property: string): void {
  const required = schema['required'];
  if (Array.isArray(required)) {
    schema['required'] = required.filter((name) => name !== property);
  }
}

function propertyOrder(spec: OperationSpec, schema: JsonSchema): string[] {
  const hidden = new Set(topLevelHiddenPaths(spec));
  const configured = spec.toolPolicy?.propertyOrder;
  if (configured !== undefined) {
    return configured.filter((path) => !hidden.has(path));
  }

  return inferredPropertyOrder(schema);
}

function topLevelHiddenPaths(spec: OperationSpec): string[] {
  return (spec.toolPolicy?.hiddenInputPaths ?? [])
    .map((path) => pathSegments(path).at(0))
    .filter((path): path is string => path !== undefined);
}

function inferredPropertyOrder(schema: JsonSchema): string[] {
  return [...requiredProperties(schema), ...optionalProperties(schema)];
}

function requiredProperties(schema: JsonSchema): string[] {
  const required = schema['required'];
  return Array.isArray(required) ? required.filter(isString) : [];
}

function optionalProperties(schema: JsonSchema): string[] {
  return propertyNames(schema).filter(
    (property) => !requiredProperties(schema).includes(property),
  );
}

function propertyNames(schema: JsonSchema): string[] {
  const properties = schema['properties'];
  return isRecord(properties) ? Object.keys(properties) : [];
}

function cloneExamples(examples: JsonObject[] | undefined): JsonObject[] {
  return (cloneJson(examples) as JsonObject[] | undefined) ?? [];
}

function defaultToolName(spec: OperationSpec): string {
  return `${spec.id}.${spec.version}`.replaceAll('.', '_');
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}
