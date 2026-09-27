import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { ApiKeyService } from './api-key.service.js';
import { type AgentToolCallRequest } from './core/contracts.js';
import { AgentToolService } from './core/agent-tool.service.js';
import {
  objectPropertyOrEmpty,
  requireApiKey,
  resultResponse,
} from './controller-utils.js';

@Controller('v1/agent-tools')
export class AgentToolsController {
  public constructor(
    private readonly apiKeys: ApiKeyService,
    private readonly agentTools: AgentToolService,
  ) {}

  @Get()
  listTools(@Headers('x-guinep-api-key') key: string | undefined): unknown {
    this.requireInvoke(key);
    return { tools: this.agentTools.listTools() };
  }

  @Post(':toolName/call')
  @HttpCode(200)
  async callTool(
    @Headers('x-guinep-api-key') key: string | undefined,
    @Param('toolName') toolName: string,
    @Body() body: AgentToolCallRequest,
  ): Promise<unknown> {
    this.requireInvoke(key);
    return resultResponse(
      await this.agentTools.callTool(
        toolName,
        objectPropertyOrEmpty(body, 'arguments'),
      ),
    );
  }

  private requireInvoke(key: string | undefined): void {
    requireApiKey(key, this.apiKeys.invokeKey);
  }
}
