import { Injectable } from '@nestjs/common';
import {
  type AgentTool,
  type ExecutionContext,
  type InvokeOperationResponse,
  type JsonObject,
  type ValidationFailure,
} from './contracts.js';
import { OperationRegistryService } from './operation-registry.service.js';
import {
  defaultContext,
  OperationRuntimeService,
} from './operation-runtime.service.js';
import { ToolSchemaService } from './tool-schema.service.js';

export type AgentToolCallResult =
  | { ok: true; value: InvokeOperationResponse }
  | { ok: false; failures: ValidationFailure[] };

type ResolvedTool =
  | { ok: true; operationId: string }
  | { ok: false; failures: ValidationFailure[] };

@Injectable()
export class AgentToolService {
  public constructor(
    private readonly registry: OperationRegistryService,
    private readonly runtime: OperationRuntimeService,
    private readonly schemas: ToolSchemaService,
  ) {}

  listTools(): AgentTool[] {
    return this.registry.listPublished().map((spec) => {
      const schema = this.schemas.toToolSchema(spec);
      const tool: AgentTool = {
        name: schema.name,
        inputSchema: schema.inputSchema,
        operationId: schema.operationId,
      };
      if (schema.description !== undefined) {
        tool.description = schema.description;
      }

      return tool;
    });
  }

  async callTool(
    toolName: string,
    args: JsonObject,
    context: ExecutionContext = defaultContext('agent'),
  ): Promise<AgentToolCallResult> {
    const resolved = this.resolveOperationId(toolName);
    return resolved.ok
      ? this.runtime.invokePublished(resolved.operationId, args, context)
      : resolved;
  }

  private resolveOperationId(toolName: string): ResolvedTool {
    const resolved = resolveTool(this.listTools(), toolName);
    if (resolved.matchCount === 1 && resolved.operationId !== undefined) {
      return { ok: true, operationId: resolved.operationId };
    }

    return toolResolutionFailure(toolName, resolved.matchCount);
  }
}

function resolveTool(
  tools: AgentTool[],
  toolName: string,
): { matchCount: number; operationId?: string } {
  let matchCount = 0;
  let operationId: string | undefined;
  for (const tool of tools) {
    if (tool.name === toolName) {
      matchCount += 1;
      operationId = tool.operationId;
    }
  }

  return operationId === undefined
    ? { matchCount }
    : { matchCount, operationId };
}

function toolResolutionFailure(
  toolName: string,
  matchCount: number,
): { ok: false; failures: ValidationFailure[] } {
  return {
    ok: false,
    failures: [
      {
        path: '$.toolName',
        code: matchCount === 0 ? 'tool_not_found' : 'ambiguous_tool',
        message: toolResolutionMessage(toolName, matchCount),
      },
    ],
  };
}

function toolResolutionMessage(toolName: string, matchCount: number): string {
  if (matchCount === 0) {
    return `Agent tool ${toolName} was not found.`;
  }

  return `Agent tool ${toolName} matches multiple operations.`;
}
