import { type AgentToolService } from './core/agent-tool.service.js';
import {
  type AgentTool,
  type JsonObject,
  type ResponseSortRule,
} from './core/contracts.js';
import { jsonRpcError, jsonRpcResult } from './mcp-json-rpc.js';
import { paginate, type McpPagination } from './mcp-pagination.js';
import { applyResponseSort } from './core/response-sort.js';

export type McpToolCallResult =
  | Awaited<ReturnType<AgentToolService['callTool']>>
  | { ok: true; value: unknown }
  | { ok: false; failures: { code: string; message: string }[] };

export function toolsListResult(
  tools: AgentTool[],
  pagination: McpPagination,
  sort?: ResponseSortRule[],
): JsonObject {
  const page = paginate(toSortedTools(tools, sort), pagination);
  const result: JsonObject = {
    resultType: 'complete',
    tools: page.items.map(toMcpTool),
    ttlMs: 60_000,
    cacheScope: 'private',
  };
  if (page.nextCursor !== undefined) {
    result['nextCursor'] = page.nextCursor;
  }

  return result;
}

function toSortedTools(
  tools: AgentTool[],
  sort: ResponseSortRule[] | undefined,
): AgentTool[] {
  return sort === undefined
    ? tools.sort(byName)
    : (applyResponseSort(tools, sort) as AgentTool[]);
}

export function toolCallResponse(
  request: JsonObject,
  result: McpToolCallResult,
): JsonObject {
  return isToolResolutionFailure(result)
    ? jsonRpcError(request, -32602, resolutionMessage(result))
    : jsonRpcResult(request, toolCallResult(result));
}

function toolCallResult(result: McpToolCallResult): JsonObject {
  return result.ok
    ? completeToolResult(result.value, isErrorValue(result.value))
    : completeToolResult({ errors: result.failures }, true);
}

function byName(left: AgentTool, right: AgentTool): number {
  return left.name.localeCompare(right.name);
}

function toMcpTool(tool: AgentTool): JsonObject {
  return {
    name: tool.name,
    title: tool.description ?? tool.name,
    description: tool.description ?? '',
    inputSchema: tool.inputSchema,
  };
}

function completeToolResult(value: unknown, isError: boolean): JsonObject {
  return {
    resultType: 'complete',
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value,
    isError,
  };
}

function isErrorValue(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    value.success === false
  );
}

function isToolResolutionFailure(
  result: McpToolCallResult,
): result is Extract<McpToolCallResult, { ok: false }> {
  return (
    !result.ok &&
    result.failures.some((failure) =>
      ['tool_not_found', 'ambiguous_tool'].includes(failure.code),
    )
  );
}

function resolutionMessage(
  result: Extract<McpToolCallResult, { ok: false }>,
): string {
  return result.failures.map((failure) => failure.message).join(' ');
}
