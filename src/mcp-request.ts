import { type JsonObject } from './core/contracts.js';
import { jsonRpcError } from './mcp-json-rpc.js';

const mcpProtocolVersion = '2026-07-28';

export interface McpValidationFailure {
  status: number;
  body: JsonObject;
}

export function validateMcpRequest(
  version: string | undefined,
  methodHeader: string | undefined,
  nameHeader: string | undefined,
  body: JsonObject,
): McpValidationFailure | undefined {
  return (
    validateVersion(version, body) ??
    validateMethodHeader(methodHeader, body) ??
    validateNameHeader(nameHeader, body)
  );
}

export function paramsOf(body: JsonObject): JsonObject {
  const params = body['params'];
  return isJsonObject(params) ? params : {};
}

export function argumentsOf(params: JsonObject): JsonObject {
  const args = params['arguments'];
  return isJsonObject(args) ? args : {};
}

function validateVersion(
  version: string | undefined,
  body: JsonObject,
): McpValidationFailure | undefined {
  if (version === mcpProtocolVersion && requestMetaVersion(body) === version) {
    return undefined;
  }

  return protocolError(
    body,
    400,
    -32022,
    `Unsupported MCP protocol version. Supported: ${mcpProtocolVersion}.`,
  );
}

function validateMethodHeader(
  methodHeader: string | undefined,
  body: JsonObject,
): McpValidationFailure | undefined {
  const method = body['method'];
  if (typeof method !== 'string' || methodHeader !== method) {
    return protocolError(body, 400, -32020, 'Mcp-Method must match method.');
  }

  return supportedMethods().includes(method)
    ? undefined
    : protocolError(body, 404, -32601, `Method not found: ${method}.`);
}

function validateNameHeader(
  nameHeader: string | undefined,
  body: JsonObject,
): McpValidationFailure | undefined {
  if (body['method'] !== 'tools/call') {
    return undefined;
  }

  const name = paramsOf(body)['name'];
  return typeof name === 'string' && nameHeader === name
    ? undefined
    : protocolError(body, 400, -32020, 'Mcp-Name must match params.name.');
}

function supportedMethods(): string[] {
  return ['tools/list', 'tools/call'];
}

function requestMetaVersion(body: JsonObject): unknown {
  return paramsMetaOf(body)['io.modelcontextprotocol/protocolVersion'];
}

function paramsMetaOf(body: JsonObject): JsonObject {
  const meta = paramsOf(body)['_meta'];
  return isJsonObject(meta) ? meta : {};
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function protocolError(
  request: JsonObject,
  status: number,
  code: number,
  message: string,
): McpValidationFailure {
  return {
    status,
    body: jsonRpcError(request, code, message),
  };
}
