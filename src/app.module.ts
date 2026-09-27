import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AgentToolsController } from './agent-tools.controller.js';
import { ApiKeyService } from './api-key.service.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { BootstrapConfigService } from './bootstrap-config.service.js';
import { AgentToolService } from './core/agent-tool.service.js';
import { AuditLogService } from './core/audit-log.service.js';
import { AuthService } from './core/auth.service.js';
import { ConnectionService } from './core/connection.service.js';
import { HttpExecutorService } from './core/http-executor.service.js';
import { InputPolicyService } from './core/input-policy.service.js';
import { MappingService } from './core/mapping.service.js';
import { OperationRegistryService } from './core/operation-registry.service.js';
import { OperationRuntimeService } from './core/operation-runtime.service.js';
import { ResponseService } from './core/response.service.js';
import { SecurityEventService } from './core/security-event.service.js';
import { SecurityGuardService } from './core/security-guard.service.js';
import { SecurityService } from './core/security.service.js';
import { ToolSchemaService } from './core/tool-schema.service.js';
import { ValidationService } from './core/validation.service.js';
import { OperationSpecsController } from './operation-specs.controller.js';

@Module({
  imports: [HttpModule],
  controllers: [AgentToolsController, AppController, OperationSpecsController],
  providers: [
    AgentToolService,
    ApiKeyService,
    AppService,
    AuditLogService,
    BootstrapConfigService,
    AuthService,
    ConnectionService,
    HttpExecutorService,
    InputPolicyService,
    MappingService,
    OperationRegistryService,
    OperationRuntimeService,
    ResponseService,
    SecurityEventService,
    SecurityGuardService,
    SecurityService,
    ToolSchemaService,
    ValidationService,
  ],
})
export class AppModule {
  getName(): string {
    return AppModule.name;
  }
}
