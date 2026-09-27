import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiKeyService } from './api-key.service.js';
import {
  type InvokeOperationRequest,
  type OperationSpec,
} from './core/contracts.js';
import { OperationRegistryService } from './core/operation-registry.service.js';
import { OperationRuntimeService } from './core/operation-runtime.service.js';
import { SecurityEventService } from './core/security-event.service.js';
import { ToolSchemaService } from './core/tool-schema.service.js';
import {
  objectPropertyOrEmpty,
  requireApiKey,
  resultResponse,
} from './controller-utils.js';
import { publicOperation } from './operation-public.js';

@Controller('v1')
export class OperationSpecsController {
  public constructor(
    private readonly apiKeys: ApiKeyService,
    private readonly registry: OperationRegistryService,
    private readonly runtime: OperationRuntimeService,
    private readonly toolSchemas: ToolSchemaService,
    private readonly securityEvents: SecurityEventService,
  ) {}

  @Post('operation-specs/drafts')
  createDraft(
    @Headers('x-guinep-admin-key') key: string | undefined,
    @Body() spec: OperationSpec,
  ): unknown {
    this.requireAdmin(key);
    return resultResponse(this.registry.createDraft(spec));
  }

  @Put('operation-specs/drafts/:draftId')
  updateDraft(
    @Headers('x-guinep-admin-key') key: string | undefined,
    @Param('draftId') draftId: string,
    @Body() spec: OperationSpec,
  ): unknown {
    this.requireAdmin(key);
    return resultResponse(this.registry.updateDraft(draftId, spec));
  }

  @Get('operation-specs/drafts/:draftId')
  getDraft(
    @Headers('x-guinep-admin-key') key: string | undefined,
    @Param('draftId') draftId: string,
  ): unknown {
    this.requireAdmin(key);
    return this.registry.getDraft(draftId) ?? { found: false };
  }

  @Post('operation-specs/drafts/:draftId/validate')
  validateDraft(
    @Headers('x-guinep-admin-key') key: string | undefined,
    @Param('draftId') draftId: string,
  ): unknown {
    this.requireAdmin(key);
    return resultResponse(this.registry.validateDraft(draftId));
  }

  @Post('operation-specs/drafts/:draftId/test')
  @HttpCode(200)
  async testDraft(
    @Headers('x-guinep-admin-key') key: string | undefined,
    @Param('draftId') draftId: string,
    @Body() body: InvokeOperationRequest,
  ): Promise<unknown> {
    this.requireAdmin(key);
    return resultResponse(
      await this.runtime.testDraft(
        draftId,
        objectPropertyOrEmpty(body, 'input'),
      ),
    );
  }

  @Post('operation-specs/drafts/:draftId/publish')
  publishDraft(
    @Headers('x-guinep-admin-key') key: string | undefined,
    @Param('draftId') draftId: string,
  ): unknown {
    this.requireAdmin(key);
    return resultResponse(this.registry.publishDraft(draftId));
  }

  @Get('operations')
  listOperations(
    @Headers('x-guinep-api-key') key: string | undefined,
  ): unknown {
    this.requireInvoke(key);
    return {
      operations: this.registry
        .listPublished()
        .map((spec) => publicOperation(spec, this.toolSchemas)),
    };
  }

  @Get('security-events')
  listSecurityEvents(
    @Headers('x-guinep-admin-key') key: string | undefined,
  ): unknown {
    this.requireAdmin(key);
    return { events: this.securityEvents.list() };
  }

  @Get('operations/:operationId')
  getOperation(
    @Headers('x-guinep-api-key') key: string | undefined,
    @Param('operationId') operationId: string,
  ): unknown {
    this.requireInvoke(key);
    return this.publishedValue(operationId, (spec) =>
      publicOperation(spec, this.toolSchemas),
    );
  }

  @Get('operations/:operationId/tool-schema')
  getToolSchema(
    @Headers('x-guinep-api-key') key: string | undefined,
    @Param('operationId') operationId: string,
  ): unknown {
    this.requireInvoke(key);
    return this.publishedValue(operationId, (spec) =>
      this.toolSchemas.toToolSchema(spec),
    );
  }

  @Post('operations/:operationId/invoke')
  @HttpCode(200)
  async invokeOperation(
    @Headers('x-guinep-api-key') key: string | undefined,
    @Param('operationId') operationId: string,
    @Body() body: InvokeOperationRequest,
  ): Promise<unknown> {
    this.requireInvoke(key);
    return resultResponse(
      await this.runtime.invokePublished(
        operationId,
        objectPropertyOrEmpty(body, 'input'),
      ),
    );
  }

  private requireAdmin(key: string | undefined): void {
    requireApiKey(key, this.apiKeys.adminKey);
  }

  private requireInvoke(key: string | undefined): void {
    requireApiKey(key, this.apiKeys.invokeKey);
  }

  private publishedValue(
    operationId: string,
    project: (spec: OperationSpec) => unknown,
  ): unknown {
    const spec = this.registry.getPublished(operationId);
    return spec === undefined ? { found: false } : project(spec);
  }
}
