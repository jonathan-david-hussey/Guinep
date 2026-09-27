import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AgentToolsController } from './agent-tools.controller.js';
import { ApiKeyService } from './api-key.service.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { BootstrapConfigService } from './bootstrap-config.service.js';
import { ChatContextController } from './chat-context.controller.js';
import { McpController } from './mcp.controller.js';
import { McpUtilityService } from './mcp-utility.service.js';
import { AgentToolService } from './core/agent-tool.service.js';
import { AuditLogService } from './core/audit-log.service.js';
import { AuthService } from './core/auth.service.js';
import { ConnectionService } from './core/connection.service.js';
import { ContextGuardService } from './core/context-guard.service.js';
import { HttpExecutorService } from './core/http-executor.service.js';
import { InputPolicyService } from './core/input-policy.service.js';
import { MappingService } from './core/mapping.service.js';
import { ModelOutputGuardService } from './core/model-output-guard.service.js';
import { OperationRegistryService } from './core/operation-registry.service.js';
import { OperationRuntimeService } from './core/operation-runtime.service.js';
import { OutputSafetyService } from './core/output-safety.service.js';
import { RetrievalGuardService } from './core/retrieval-guard.service.js';
import { ResponseService } from './core/response.service.js';
import { SecurityEventService } from './core/security-event.service.js';
import { SecurityGuardService } from './core/security-guard.service.js';
import { SecurityService } from './core/security.service.js';
import { SystemPromptPolicyService } from './core/system-prompt-policy.service.js';
import { ToolSchemaService } from './core/tool-schema.service.js';
import { ValidationService } from './core/validation.service.js';
import { OperationSpecsController } from './operation-specs.controller.js';
import { ResponseProjectionInterceptor } from './response-projection.js';

@Module({
  imports: [HttpModule],
  controllers: [AgentToolsController, AppController, ChatContextController, McpController, OperationSpecsController],
  providers: [
    AgentToolService,
    ApiKeyService,
    AppService,
    AuditLogService,
    BootstrapConfigService,
    AuthService,
    ConnectionService,
    ContextGuardService,
    HttpExecutorService,
    InputPolicyService,
    MappingService,
    McpUtilityService,
    ModelOutputGuardService,
    OperationRegistryService,
    OperationRuntimeService,
    OutputSafetyService,
    RetrievalGuardService,
    ResponseService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseProjectionInterceptor,
    },
    SecurityEventService,
    SecurityGuardService,
    SecurityService,
    SystemPromptPolicyService,
    ToolSchemaService,
    ValidationService,
  ],
})
export class AppModule {
  getName(): string {
    return AppModule.name;
  }
}
