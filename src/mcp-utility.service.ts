import { Ajv } from 'ajv/dist/ajv.js';
import { Injectable } from '@nestjs/common';
import {
  type AgentTool,
  type JsonObject,
  type JsonSchema,
  type OutputSink,
  type ValidationFailure,
} from './core/contracts.js';
import { ajvFailures } from './core/ajv-utils.js';
import { ModelOutputGuardService } from './core/model-output-guard.service.js';
import { OutputSafetyService } from './core/output-safety.service.js';
import { cloneJson, hasPath, readPath, writePath } from './core/path-utils.js';
import { redactSecretLikeKeys, redactValue } from './core/redaction.js';
import { scanTextContent } from './core/security-scanner.js';

type UtilityHandler = (args: JsonObject) => unknown;

interface McpUtility {
  tool: AgentTool;
  handler: UtilityHandler;
}

export type McpUtilityCallResult =
  { ok: true; value: unknown } | { ok: false; failures: ValidationFailure[] };

@Injectable()
export class McpUtilityService {
  private readonly ajv = new Ajv({ allErrors: true, strict: false });
  private readonly utilities: McpUtility[];
  private readonly utilitiesByName: Map<string, McpUtility[]>;

  public constructor(
    private readonly outputSafety: OutputSafetyService,
    private readonly modelOutputGuard: ModelOutputGuardService,
  ) {
    this.utilities = [
      ...requestUtilities(),
      ...responseUtilities(),
      ...safetyUtilities(this.outputSafety, this.modelOutputGuard, this.ajv),
    ];
    this.utilitiesByName = indexUtilitiesByName(this.utilities);
  }

  listTools(): AgentTool[] {
    return this.utilities.map((utility) => utility.tool).sort(byName);
  }

  hasTool(name: string): boolean {
    return this.utilitiesByName.has(name);
  }

  callTool(name: string, args: JsonObject): McpUtilityCallResult {
    const matches = this.utilitiesByName.get(name) ?? [];
    if (matches.length !== 1) {
      return {
        ok: false,
        failures: [
          {
            path: '$.name',
            code: matches.length === 0 ? 'tool_not_found' : 'ambiguous_tool',
            message:
              matches.length === 0
                ? `MCP utility ${name} was not found.`
                : `MCP utility ${name} matches multiple utilities.`,
          },
        ],
      };
    }

    return { ok: true, value: firstUtility(matches).handler(args) };
  }
}

function indexUtilitiesByName(
  utilities: McpUtility[],
): Map<string, McpUtility[]> {
  const index = new Map<string, McpUtility[]>();
  for (const utility of utilities) {
    const name = utility.tool.name;
    const namedUtilities = index.get(name);
    if (namedUtilities === undefined) {
      index.set(name, [utility]);
    } else {
      namedUtilities.push(utility);
    }
  }

  return index;
}

function firstUtility(utilities: McpUtility[]): McpUtility {
  const utility = utilities[0];
  if (utility === undefined) {
    throw new Error('Expected at least one MCP utility.');
  }

  return utility;
}

function requestUtilities(): McpUtility[] {
  return [
    ...requestPathReadUtilities(),
    ...requestPathCheckUtilities(),
    ...requestPathWriteUtilities(),
    ...requestHeaderUtilities(),
    ...requestQueryReadUtilities(),
    ...requestQueryWriteUtilities(),
    ...requestUrlUtilities(),
    ...requestJsonUtilities(),
    ...requestFormUtilities(),
  ];
}

function requestPathReadUtilities(): McpUtility[] {
  return [
    utility(
      'guinep_request_pick',
      'Read one JSON-path value from a request object.',
      objectSchema({
        request: {},
        path: { type: 'string' },
      }),
      (args) => ({
        value: readPath(args['request'], stringArg(args, 'path', '$')),
      }),
    ),
    utility(
      'guinep_request_pick_many',
      'Read many JSON-path values from a request object.',
      objectSchema({
        request: {},
        paths: arraySchema({ type: 'string' }),
      }),
      (args) => pickMany(args['request'], stringArrayArg(args, 'paths')),
    ),
  ];
}

function requestPathCheckUtilities(): McpUtility[] {
  return [
    utility(
      'guinep_request_has_path',
      'Check whether a request object contains a JSON path.',
      objectSchema({
        request: {},
        path: { type: 'string' },
      }),
      (args) => ({
        exists: hasPath(args['request'], stringArg(args, 'path', '$')),
      }),
    ),
    utility(
      'guinep_request_write_path',
      'Return a copy of a request object with one JSON-path value written.',
      objectSchema({
        request: objectSchema({}),
        path: { type: 'string' },
        value: {},
      }),
      (args) =>
        writePathCopy(
          objectArg(args, 'request'),
          stringArg(args, 'path', '$'),
          args['value'],
        ),
    ),
    utility(
      'guinep_request_require_paths',
      'Validate that required request JSON paths are present.',
      objectSchema({
        request: {},
        paths: arraySchema({ type: 'string' }),
      }),
      (args) => requirePaths(args['request'], stringArrayArg(args, 'paths')),
    ),
  ];
}

function requestPathWriteUtilities(): McpUtility[] {
  return [
    utility(
      'guinep_request_strip_paths',
      'Return a copy of a request object containing only selected JSON paths.',
      objectSchema({
        request: {},
        paths: arraySchema({ type: 'string' }),
      }),
      (args) => stripToPaths(args['request'], stringArrayArg(args, 'paths')),
    ),
    utility(
      'guinep_request_redact_paths',
      'Return a request object with selected JSON paths redacted.',
      objectSchema({
        request: {},
        paths: arraySchema({ type: 'string' }),
      }),
      (args) => redactValue(args['request'], stringArrayArg(args, 'paths')),
    ),
    utility(
      'guinep_request_redact_secret_keys',
      'Return a request object with secret-like keys redacted.',
      objectSchema({ request: {} }),
      (args) => redactSecretLikeKeys(args['request']),
    ),
  ];
}

function requestHeaderUtilities(): McpUtility[] {
  return [
    utility(
      'guinep_request_header_get',
      'Read a request header case-insensitively.',
      objectSchema({
        headers: objectSchema({}),
        name: { type: 'string' },
      }),
      (args) =>
        headerGet(recordArg(args, 'headers'), stringArg(args, 'name', '')),
    ),
    utility(
      'guinep_request_header_set',
      'Return headers with one value set.',
      objectSchema({
        headers: objectSchema({}),
        name: { type: 'string' },
        value: { type: 'string' },
      }),
      (args) => ({
        ...recordArg(args, 'headers'),
        [stringArg(args, 'name', '')]: stringArg(args, 'value', ''),
      }),
    ),
    utility(
      'guinep_request_header_remove',
      'Return headers with one case-insensitive name removed.',
      objectSchema({
        headers: objectSchema({}),
        name: { type: 'string' },
      }),
      (args) =>
        removeHeader(recordArg(args, 'headers'), stringArg(args, 'name', '')),
    ),
  ];
}

function requestQueryReadUtilities(): McpUtility[] {
  return [
    utility(
      'guinep_request_query_get',
      'Read a query parameter value from a URL.',
      objectSchema({
        url: { type: 'string' },
        name: { type: 'string' },
      }),
      (args) => ({
        value: urlOf(args).searchParams.get(stringArg(args, 'name', '')),
      }),
    ),
  ];
}

function requestQueryWriteUtilities(): McpUtility[] {
  return [
    utility(
      'guinep_request_query_set',
      'Return a URL with one query parameter set.',
      objectSchema({
        url: { type: 'string' },
        name: { type: 'string' },
        value: { type: 'string' },
      }),
      (args) => {
        const url = urlOf(args);
        url.searchParams.set(
          stringArg(args, 'name', ''),
          stringArg(args, 'value', ''),
        );
        return { url: url.toString() };
      },
    ),
    utility(
      'guinep_request_query_remove',
      'Return a URL with one query parameter removed.',
      objectSchema({
        url: { type: 'string' },
        name: { type: 'string' },
      }),
      (args) => {
        const url = urlOf(args);
        url.searchParams.delete(stringArg(args, 'name', ''));
        return { url: url.toString() };
      },
    ),
  ];
}

function requestUrlUtilities(): McpUtility[] {
  return [
    utility(
      'guinep_request_url_host',
      'Extract URL scheme, host, pathname, and query.',
      objectSchema({ url: { type: 'string' } }),
      (args) => urlParts(urlOf(args)),
    ),
    utility(
      'guinep_request_url_allowed',
      'Check whether a URL matches allowed schemes and hosts.',
      objectSchema({
        url: { type: 'string' },
        allowedHosts: arraySchema({ type: 'string' }),
        allowedSchemes: arraySchema({ type: 'string' }),
      }),
      (args) =>
        urlAllowed(
          urlOf(args),
          stringArrayArg(args, 'allowedHosts'),
          stringArrayArg(args, 'allowedSchemes'),
        ),
    ),
  ];
}

function requestJsonUtilities(): McpUtility[] {
  return [
    utility(
      'guinep_request_json_stringify',
      'Serialize a request value to compact JSON.',
      objectSchema({ value: {} }),
      (args) => ({ text: JSON.stringify(args['value']) }),
    ),
    utility(
      'guinep_request_json_parse',
      'Parse a JSON request body string.',
      objectSchema({ text: { type: 'string' } }),
      (args) => ({
        value: JSON.parse(stringArg(args, 'text', 'null')) as unknown,
      }),
    ),
    utility(
      'guinep_request_size',
      'Measure serialized request byte size.',
      objectSchema({ request: {} }),
      (args) => ({
        bytes: Buffer.byteLength(
          JSON.stringify(args['request'] ?? null),
          'utf8',
        ),
      }),
    ),
  ];
}

function requestFormUtilities(): McpUtility[] {
  return [
    utility(
      'guinep_request_normalize_method',
      'Normalize an HTTP method to uppercase.',
      objectSchema({ method: { type: 'string' } }),
      (args) => ({ method: stringArg(args, 'method', 'GET').toUpperCase() }),
    ),
    utility(
      'guinep_request_body_form_encode',
      'Encode a flat request object as application/x-www-form-urlencoded text.',
      objectSchema({ body: objectSchema({}) }),
      (args) => ({ text: formEncode(recordArg(args, 'body')) }),
    ),
    utility(
      'guinep_request_body_form_decode',
      'Decode application/x-www-form-urlencoded request text.',
      objectSchema({ text: { type: 'string' } }),
      (args) => ({
        body: Object.fromEntries(
          new URLSearchParams(stringArg(args, 'text', '')),
        ),
      }),
    ),
  ];
}

function responseUtilities(): McpUtility[] {
  return [
    ...responsePathReadUtilities(),
    ...responsePathWriteUtilities(),
    ...responseEnvelopeUtilities(),
    ...responseCollectionUtilities(),
    ...responseTextUtilities(),
  ];
}

function responsePathReadUtilities(): McpUtility[] {
  return [
    utility(
      'guinep_response_pick',
      'Read one JSON-path value from a response object.',
      objectSchema({
        response: {},
        path: { type: 'string' },
      }),
      (args) => ({
        value: readPath(args['response'], stringArg(args, 'path', '$')),
      }),
    ),
    utility(
      'guinep_response_pick_many',
      'Read many JSON-path values from a response object.',
      objectSchema({
        response: {},
        paths: arraySchema({ type: 'string' }),
      }),
      (args) => pickMany(args['response'], stringArrayArg(args, 'paths')),
    ),
    utility(
      'guinep_response_has_path',
      'Check whether a response object contains a JSON path.',
      objectSchema({
        response: {},
        path: { type: 'string' },
      }),
      (args) => ({
        exists: hasPath(args['response'], stringArg(args, 'path', '$')),
      }),
    ),
  ];
}

function responsePathWriteUtilities(): McpUtility[] {
  return [
    utility(
      'guinep_response_strip_paths',
      'Return a response object containing only selected JSON paths.',
      objectSchema({
        response: {},
        paths: arraySchema({ type: 'string' }),
      }),
      (args) => stripToPaths(args['response'], stringArrayArg(args, 'paths')),
    ),
    utility(
      'guinep_response_redact_paths',
      'Return a response object with selected JSON paths redacted.',
      objectSchema({
        response: {},
        paths: arraySchema({ type: 'string' }),
      }),
      (args) => redactValue(args['response'], stringArrayArg(args, 'paths')),
    ),
    utility(
      'guinep_response_redact_secret_keys',
      'Return a response object with secret-like keys redacted.',
      objectSchema({ response: {} }),
      (args) => redactSecretLikeKeys(args['response']),
    ),
  ];
}

function responseEnvelopeUtilities(): McpUtility[] {
  return [
    utility(
      'guinep_response_success_envelope',
      'Wrap response data in a Guinep success envelope.',
      objectSchema({
        operationId: { type: 'string' },
        data: {},
        providerStatus: { type: 'number' },
      }),
      (args) => ({
        success: true,
        operationId: stringArg(args, 'operationId', 'utility'),
        status: 200,
        providerStatus: numberArg(args, 'providerStatus', 200),
        data: args['data'],
      }),
    ),
    utility(
      'guinep_response_failure_envelope',
      'Wrap response failure details in a workflow-safe Guinep envelope.',
      objectSchema({
        operationId: { type: 'string' },
        code: { type: 'string' },
        message: { type: 'string' },
        providerStatus: { type: 'number' },
        recoverable: { type: 'boolean' },
      }),
      (args) => ({
        success: false,
        operationId: stringArg(args, 'operationId', 'utility'),
        status: 200,
        providerStatus: numberArg(args, 'providerStatus', 500),
        recoverable: booleanArg(args, 'recoverable', false),
        code: stringArg(args, 'code', 'upstream_error'),
        message: stringArg(args, 'message', 'Upstream request failed.'),
      }),
    ),
  ];
}

function responseCollectionUtilities(): McpUtility[] {
  return [
    utility(
      'guinep_response_limit_array',
      'Limit a response array to the first N items.',
      objectSchema({
        items: arraySchema({}),
        limit: { type: 'integer' },
      }),
      (args) => ({
        items: unknownArrayArg(args, 'items').slice(
          0,
          Math.max(0, numberArg(args, 'limit', 0)),
        ),
      }),
    ),
    utility(
      'guinep_response_count',
      'Count top-level array items or object properties.',
      objectSchema({ response: {} }),
      (args) => countValue(args['response']),
    ),
    utility(
      'guinep_response_flatten_object',
      'Flatten a response object into JSON-path keys.',
      objectSchema({ response: {} }),
      (args) => ({ values: flatten(args['response'], '$') }),
    ),
  ];
}

function responseTextUtilities(): McpUtility[] {
  return [
    utility(
      'guinep_response_size',
      'Measure serialized response byte size.',
      objectSchema({ response: {} }),
      (args) => ({
        bytes: Buffer.byteLength(
          JSON.stringify(args['response'] ?? null),
          'utf8',
        ),
      }),
    ),
    utility(
      'guinep_response_to_text',
      'Serialize response content as display text.',
      objectSchema({ response: {} }),
      (args) => ({
        text:
          typeof args['response'] === 'string'
            ? args['response']
            : JSON.stringify(args['response']),
      }),
    ),
    utility(
      'guinep_response_from_text',
      'Parse response display text as JSON when possible.',
      objectSchema({ text: { type: 'string' } }),
      (args) => parseMaybeJson(stringArg(args, 'text', '')),
    ),
    utility(
      'guinep_response_status_class',
      'Classify an HTTP status code.',
      objectSchema({ status: { type: 'number' } }),
      (args) => statusClass(numberArg(args, 'status', 0)),
    ),
  ];
}

function safetyUtilities(
  outputSafety: OutputSafetyService,
  modelOutputGuard: ModelOutputGuardService,
  ajv: Ajv,
): McpUtility[] {
  return [
    ...safetyScanUtilities(outputSafety),
    ...safetyValidationUtilities(modelOutputGuard, ajv),
  ];
}

function safetyScanUtilities(outputSafety: OutputSafetyService): McpUtility[] {
  return [
    utility(
      'guinep_safety_scan_text',
      'Scan request or response content for prompt-injection and unsafe text signals.',
      objectSchema({ content: {} }),
      (args) => ({
        signals: scanTextContent(args['content'], {
          textTooLargeCode: 'mcp_text_limit_exceeded',
        }),
      }),
    ),
    utility(
      'guinep_output_prepare',
      'Prepare output safely for json, markdown, html, terminal, or log sinks.',
      objectSchema({
        content: {},
        sink: { type: 'string' },
      }),
      (args) => outputSafety.prepare(args['content'], sinkArg(args)),
    ),
    utility(
      'guinep_content_neutralize_html',
      'Escape HTML-special characters in request or response text.',
      objectSchema({ text: { type: 'string' } }),
      (args) => outputSafety.prepare(stringArg(args, 'text', ''), 'html'),
    ),
    utility(
      'guinep_content_neutralize_markdown',
      'Disable markdown image syntax in request or response text.',
      objectSchema({ text: { type: 'string' } }),
      (args) => outputSafety.prepare(stringArg(args, 'text', ''), 'markdown'),
    ),
  ];
}

function safetyValidationUtilities(
  modelOutputGuard: ModelOutputGuardService,
  ajv: Ajv,
): McpUtility[] {
  return [
    utility(
      'guinep_model_output_validate',
      'Validate model output against a JSON Schema and scanner signals.',
      objectSchema({
        output: {},
        schema: objectSchema({}),
      }),
      (args) => modelOutputGuard.validate(args['output'], schemaArg(args)),
    ),
    utility(
      'guinep_json_schema_validate',
      'Validate any request or response value against a JSON Schema.',
      objectSchema({
        value: {},
        schema: objectSchema({}),
      }),
      (args) => validateJsonSchema(ajv, args['value'], schemaArg(args)),
    ),
  ];
}

function utility(
  name: string,
  description: string,
  inputSchema: JsonSchema,
  handler: UtilityHandler,
): McpUtility {
  return {
    tool: { name, description, inputSchema, operationId: `mcp.${name}` },
    handler,
  };
}

function objectSchema(properties: Record<string, JsonSchema>): JsonSchema {
  return { type: 'object', properties, additionalProperties: true };
}

function arraySchema(items: JsonSchema): JsonSchema {
  return { type: 'array', items };
}

function pickMany(source: unknown, paths: string[]): JsonObject {
  return Object.fromEntries(
    paths.map((path) => [path, readPath(source, path)]),
  );
}

function writePathCopy(
  request: JsonObject,
  path: string,
  value: unknown,
): JsonObject {
  const next = cloneJson(request) as JsonObject;
  writePath(next, path, value);
  return next;
}

function requirePaths(source: unknown, paths: string[]): JsonObject {
  const missing = paths.filter((path) => !hasPath(source, path));
  return {
    ok: missing.length === 0,
    missing,
  };
}

function stripToPaths(source: unknown, paths: string[]): JsonObject {
  const next: JsonObject = {};
  for (const path of paths) {
    if (hasPath(source, path)) {
      writePath(next, path, readPath(source, path));
    }
  }

  return next;
}

function headerGet(headers: Record<string, unknown>, name: string): JsonObject {
  const match = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  return { value: match?.[1] };
}

function removeHeader(
  headers: Record<string, unknown>,
  name: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([key]) => key.toLowerCase() !== name.toLowerCase(),
    ),
  );
}

function urlOf(args: JsonObject): URL {
  return new URL(stringArg(args, 'url', 'http://localhost/'));
}

function urlParts(url: URL): JsonObject {
  return {
    scheme: url.protocol.slice(0, -1),
    host: url.hostname,
    pathname: url.pathname,
    query: Object.fromEntries(url.searchParams),
  };
}

function urlAllowed(
  url: URL,
  allowedHosts: string[],
  allowedSchemes: string[],
): JsonObject {
  const scheme = url.protocol.slice(0, -1);
  return {
    allowed:
      allowedHosts.includes(url.hostname) && allowedSchemes.includes(scheme),
    scheme,
    host: url.hostname,
  };
}

function formEncode(body: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    params.set(key, scalarText(value));
  }

  return params.toString();
}

function countValue(value: unknown): JsonObject {
  if (Array.isArray(value)) {
    return { kind: 'array', count: value.length };
  }

  if (isJsonObject(value)) {
    return { kind: 'object', count: Object.keys(value).length };
  }

  return { kind: 'scalar', count: value === undefined ? 0 : 1 };
}

function flatten(value: unknown, path: string): Record<string, unknown> {
  if (!isJsonObject(value)) {
    return { [path]: value };
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      Object.entries(flatten(child, `${path}.${key}`)),
    ),
  );
}

function parseMaybeJson(text: string): JsonObject {
  try {
    return { value: JSON.parse(text) as unknown, parsed: true };
  } catch {
    return { value: text, parsed: false };
  }
}

function statusClass(status: number): JsonObject {
  return {
    family: Math.trunc(status / 100),
    success: status >= 200 && status <= 299,
    clientError: status >= 400 && status <= 499,
    serverError: status >= 500 && status <= 599,
  };
}

function validateJsonSchema(
  ajv: Ajv,
  value: unknown,
  schema: JsonSchema,
): JsonObject {
  const validate = ajv.compile(schema);
  return validate(value)
    ? { ok: true, failures: [] }
    : { ok: false, failures: ajvFailures(validate, 'Value is invalid.') };
}

function schemaArg(args: JsonObject): JsonSchema {
  return objectArg(args, 'schema');
}

function objectArg(args: JsonObject, name: string): JsonObject {
  const value = args[name];
  return isJsonObject(value) ? value : {};
}

function recordArg(args: JsonObject, name: string): Record<string, unknown> {
  return objectArg(args, name);
}

function stringArrayArg(args: JsonObject, name: string): string[] {
  const value = args[name];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function unknownArrayArg(args: JsonObject, name: string): unknown[] {
  const value = args[name];
  return Array.isArray(value) ? value : [];
}

function stringArg(args: JsonObject, name: string, fallback: string): string {
  const value = args[name];
  return typeof value === 'string' ? value : fallback;
}

function numberArg(args: JsonObject, name: string, fallback: number): number {
  const value = args[name];
  return typeof value === 'number' ? value : fallback;
}

function booleanArg(
  args: JsonObject,
  name: string,
  fallback: boolean,
): boolean {
  const value = args[name];
  return typeof value === 'boolean' ? value : fallback;
}

function sinkArg(args: JsonObject): OutputSink {
  const value = args['sink'];
  if (
    value === 'html' ||
    value === 'json' ||
    value === 'log' ||
    value === 'markdown' ||
    value === 'terminal'
  ) {
    return value;
  }

  return 'json';
}

function scalarText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return String(value);
  }

  return JSON.stringify(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function byName(left: AgentTool, right: AgentTool): number {
  return left.name.localeCompare(right.name);
}
