import { type JsonObject } from './core/contracts.js';

export function jsonRpcResult(
  request: JsonObject,
  result: JsonObject,
): JsonObject {
  return { jsonrpc: '2.0', id: request['id'] ?? null, result };
}

export function jsonRpcError(
  request: JsonObject,
  code: number,
  message: string,
): JsonObject {
  return {
    jsonrpc: '2.0',
    id: request['id'] ?? null,
    error: { code, message },
  };
}
