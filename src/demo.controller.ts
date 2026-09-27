import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { AgentToolService } from './core/agent-tool.service.js';
import { ConnectionService } from './core/connection.service.js';
import { type JsonObject, type OperationSpec } from './core/contracts.js';
import {
  ContextGuardService,
  userContextItem,
} from './core/context-guard.service.js';
import { ModelOutputGuardService } from './core/model-output-guard.service.js';
import { OperationRegistryService } from './core/operation-registry.service.js';
import { OperationRuntimeService } from './core/operation-runtime.service.js';
import { RetrievalGuardService } from './core/retrieval-guard.service.js';
import { SecurityEventService } from './core/security-event.service.js';
import { SystemPromptPolicyService } from './core/system-prompt-policy.service.js';
import { ToolSchemaService } from './core/tool-schema.service.js';
import { publicOperation } from './operation-public.js';
import { ApiKeyService } from './api-key.service.js';
import { requireApiKey, resultResponse } from './controller-utils.js';
import {
  agentContext,
  apiContext,
  demoBaseUrl,
  demoConnectionId,
  demoOperationId,
  demoSecret,
  demoToolName,
  helpdeskSpec,
  injectionRetrievedItem,
  modelActionSchema,
  subjectOf,
  systemPromptPolicy,
  ticketInput,
} from './demo-helpdesk.js';

@Controller('v1/demo')
export class DemoController {
  public constructor(
    private readonly apiKeys: ApiKeyService,
    private readonly agentTools: AgentToolService,
    private readonly connections: ConnectionService,
    private readonly contextGuard: ContextGuardService,
    private readonly modelOutputGuard: ModelOutputGuardService,
    private readonly registry: OperationRegistryService,
    private readonly retrievalGuard: RetrievalGuardService,
    private readonly runtime: OperationRuntimeService,
    private readonly securityEvents: SecurityEventService,
    private readonly systemPrompts: SystemPromptPolicyService,
    private readonly toolSchemas: ToolSchemaService,
  ) {}

  @Post('helpdesk/run')
  @HttpCode(200)
  async runHelpdeskDemo(
    @Headers('x-guinep-admin-key') key: string | undefined,
    @Headers('host') host: string | undefined,
  ): Promise<unknown> {
    requireApiKey(key, this.apiKeys.adminKey);
    const spec = this.prepareDemoSpec(host);
    return {
      demo: 'helpdesk-agent-tool',
      steps: await this.runDemoSteps(spec),
    };
  }

  @Get('helpdesk/spec')
  getHelpdeskSpec(@Headers('host') host: string | undefined): OperationSpec {
    return helpdeskSpec(demoBaseUrl(host));
  }

  @Post('mock-helpdesk/tickets')
  @HttpCode(201)
  createMockTicket(
    @Headers('x-api-key') apiKey: string | undefined,
    @Body() body: JsonObject,
  ): unknown {
    if (apiKey !== demoSecret) {
      throw new UnauthorizedException('Bad upstream auth.');
    }

    return {
      ticket: {
        id: 'DEMO-1',
        subject: subjectOf(body),
        status: 'open',
      },
      secret: 'provider-secret',
    };
  }

  @Get('mock-helpdesk/tickets/:id')
  getMockTicket(@Param('id') id: string): unknown {
    return {
      ticket: {
        id,
        subject: 'Existing ticket',
        status: 'open',
      },
    };
  }

  private prepareDemoSpec(host: string | undefined): OperationSpec {
    const baseUrl = demoBaseUrl(host);
    this.connections.setConnection({
      id: demoConnectionId,
      baseUrl,
      secrets: { apiKey: demoSecret },
    });
    return helpdeskSpec(baseUrl);
  }

  private async runDemoSteps(spec: OperationSpec): Promise<unknown> {
    const createDraft = this.registry.createDraft(spec);
    const validateDraft = this.registry.validateDraft(demoOperationId);
    const testDraft = await this.runtime.testDraft(
      demoOperationId,
      ticketInput('Draft API test'),
      apiContext(),
    );
    const publish = this.registry.publishDraft(demoOperationId);
    return {
      createDraft: resultResponse(createDraft),
      validateDraft: resultResponse(validateDraft),
      testDraft: resultResponse(testDraft),
      publish: resultResponse(publish),
      ...this.publicDemoSteps(spec),
      ...(await this.agentExecutionSteps()),
      securityEvents: this.securityEvents.list(),
    };
  }

  private publicDemoSteps(spec: OperationSpec): JsonObject {
    return {
      publicOperations: this.registry
        .listPublished()
        .map((operation) => publicOperation(operation, this.toolSchemas)),
      toolSchema: this.toolSchemas.toToolSchema(spec),
      agentTools: this.agentTools.listTools(),
      prepareContext: this.contextGuard.prepareForModel(
        [
          userContextItem(
            'user',
            'Create a ticket for the latest delivery issue.',
          ),
        ],
        agentContext(),
      ),
      systemPrompt: this.systemPrompts.build(systemPromptPolicy()),
      validateModelOutput: this.modelOutputGuard.validate(
        { action: 'createTicket', subject: 'Delivery issue' },
        modelActionSchema(),
      ),
    };
  }

  private async agentExecutionSteps(): Promise<JsonObject> {
    const agentToolCall = await this.agentTools.callTool(
      demoToolName,
      ticketInput('Agent tool call'),
      agentContext(),
    );
    const invalidToolCall = await this.agentTools.callTool(
      demoToolName,
      { subject: 'Missing required fields' },
      agentContext(),
    );
    return {
      agentToolCall: resultResponse(agentToolCall),
      invalidToolCall: resultResponse(invalidToolCall),
      retrievalQuarantine: this.retrievalGuard.prepareRetrievedContent(
        [injectionRetrievedItem()],
        agentContext(),
      ),
    };
  }
}
