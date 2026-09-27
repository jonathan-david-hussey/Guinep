import { Body, Controller, Headers, HttpCode, Post, Res } from '@nestjs/common';
import { ApiKeyService } from './api-key.service.js';
import { AgentToolService } from './core/agent-tool.service.js';
import { type JsonObject } from './core/contracts.js';
import { requireApiKey } from './controller-utils.js';
import { mcpContext } from './mcp-context.js';
import { jsonRpcResult } from './mcp-json-rpc.js';
import { paginationOf } from './mcp-pagination.js';
import { argumentsOf, paramsOf, validateMcpRequest } from './mcp-request.js';
import { toolCallResponse, toolsListResult } from './mcp-results.js';
import { McpUtilityService } from './mcp-utility.service.js';
import { responseControlsFromRequest } from './response-projection.js';

@Controller('mcp')
export class McpController {
  public constructor(
    private readonly apiKeys: ApiKeyService,
    private readonly agentTools: AgentToolService,
    private readonly utilities: McpUtilityService,
  ) {}

  @Post()
  @HttpCode(200)
  async handle(
    @Headers('x-guinep-api-key') key: string | undefined,
    @Headers('mcp-protocol-version') version: string | undefined,
    @Headers('mcp-method') methodHeader: string | undefined,
    @Headers('mcp-name') nameHeader: string | undefined,
    @Body() body: JsonObject,
    @Res({ passthrough: true }) response: StatusResponse,
  ): Promise<unknown> {
    requireApiKey(key, this.apiKeys.invokeKey);
    const validation = validateMcpRequest(
      version,
      methodHeader,
      nameHeader,
      body,
    );
    if (validation !== undefined) {
      response.status(validation.status);
      return validation.body;
    }

    return this.dispatch(body);
  }

  private async dispatch(body: JsonObject): Promise<JsonObject> {
    const method = String(body['method']);
    if (method === 'tools/list') {
      const params = paramsOf(body);
      return jsonRpcResult(
        body,
        toolsListResult(
          this.listTools(),
          paginationOf(params),
          responseControlsFromRequest({ body })?.sort,
        ),
      );
    }

    return this.callTool(body);
  }

  private listTools(): ReturnType<AgentToolService['listTools']> {
    const tools = this.utilities.listTools();
    for (const tool of this.agentTools.listTools()) {
      tools.push(tool);
    }

    return tools;
  }

  private async callTool(body: JsonObject): Promise<JsonObject> {
    const params = paramsOf(body);
    const name = String(params['name']);
    if (this.utilities.hasTool(name)) {
      return toolCallResponse(
        body,
        this.utilities.callTool(name, argumentsOf(params)),
      );
    }

    const result = await this.agentTools.callTool(
      name,
      argumentsOf(params),
      mcpContext(),
    );
    return toolCallResponse(body, result);
  }
}

interface StatusResponse {
  status(code: number): unknown;
}
