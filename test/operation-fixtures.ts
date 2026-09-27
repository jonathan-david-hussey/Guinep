import { AuditLogService } from '../src/core/audit-log.service.js';
import { AuthService } from '../src/core/auth.service.js';
import { ConnectionService } from '../src/core/connection.service.js';
import {
  type ConnectionSpec,
  type JsonSchema,
  type OperationSpec,
  type UpstreamResult,
} from '../src/core/contracts.js';
import { type HttpExecutorService } from '../src/core/http-executor.service.js';
import { InputPolicyService } from '../src/core/input-policy.service.js';
import { MappingService } from '../src/core/mapping.service.js';
import { OperationRegistryService } from '../src/core/operation-registry.service.js';
import { OperationRuntimeService } from '../src/core/operation-runtime.service.js';
import { ResponseService } from '../src/core/response.service.js';
import { SecurityEventService } from '../src/core/security-event.service.js';
import { SecurityGuardService } from '../src/core/security-guard.service.js';
import { SecurityService } from '../src/core/security.service.js';
import { ValidationService } from '../src/core/validation.service.js';

export interface RuntimeHarness {
  registry: OperationRegistryService;
  runtime: OperationRuntimeService;
}

export function runtimeHarness(
  result: UpstreamResult,
  activeConnection: ConnectionSpec = connection(),
): RuntimeHarness {
  const validation = new ValidationService();
  const registry = new OperationRegistryService(validation);
  const connections = new ConnectionService();
  connections.setConnection(activeConnection);
  return {
    registry,
    runtime: operationRuntime(
      registry,
      connections,
      validation,
      executor(result),
    ),
  };
}

export function operationRuntime(
  registry: OperationRegistryService,
  connections: ConnectionService,
  validation: ValidationService,
  executor: HttpExecutorService,
): OperationRuntimeService {
  return new OperationRuntimeService(
    registry,
    connections,
    new InputPolicyService(),
    validation,
    new MappingService(),
    new AuthService(),
    new SecurityService(),
    new SecurityGuardService(new SecurityEventService()),
    executor,
    new ResponseService(),
    new AuditLogService(),
  );
}

function executor(result: UpstreamResult): HttpExecutorService {
  return {
    execute: () => Promise.resolve(result),
  } as unknown as HttpExecutorService;
}

export function connection(
  overrides: Partial<ConnectionSpec> = {},
): ConnectionSpec {
  return {
    id: 'mock',
    baseUrl: 'https://api.example.test',
    secrets: {},
    ...overrides,
  };
}

export function operationSpec(
  overrides: Partial<OperationSpec> = {},
): OperationSpec {
  return {
    id: 'helpdesk.createTicket',
    version: 'v1',
    status: 'draft',
    connectionId: 'mock',
    request: ticketRequest(),
    inputSchema: inputSchema(),
    authPolicy: { type: 'none' },
    responsePolicy: {},
    securityPolicy: securityPolicy(),
    ...overrides,
  };
}

export function ticketRequest(
  overrides: Partial<OperationSpec['request']> = {},
): OperationSpec['request'] {
  return {
    method: 'POST',
    path: '/tickets',
    mappings: [{ from: '$.subject', to: 'body.subject', required: true }],
    ...overrides,
  };
}

export function inputSchema(): OperationSpec['inputSchema'] {
  return {
    type: 'object',
    required: ['subject'],
    properties: { subject: { type: 'string' } },
  };
}

export function ticketInputSchema(
  minLength?: number,
): OperationSpec['inputSchema'] {
  return {
    type: 'object',
    required: ['subject'],
    properties: {
      subject:
        minLength === undefined
          ? { type: 'string' }
          : { type: 'string', minLength },
    },
  };
}

export function ticketResponsePolicy(
  options: { includeTimeout?: boolean; retryMessage?: string } = {},
): OperationSpec['responsePolicy'] {
  return {
    success: { include: ['$.ticket.id', '$.ticket.subject'] },
    error: { rules: ticketErrorRules(options) },
  };
}

function ticketErrorRules(options: {
  includeTimeout?: boolean;
  retryMessage?: string;
}): NonNullable<OperationSpec['responsePolicy']['error']>['rules'] {
  const rules: NonNullable<OperationSpec['responsePolicy']['error']>['rules'] =
    [
      {
        status: 404,
        behavior: 'return',
        code: 'not_found',
        message: 'Not found.',
        recoverable: true,
      },
      {
        statusRange: { min: 500, max: 599 },
        behavior: 'retry_then_return',
        code: 'upstream_retryable',
        message: options.retryMessage ?? 'Retry later.',
        recoverable: true,
      },
    ];
  return options.includeTimeout === true
    ? [...rules, timeoutErrorRule()]
    : rules;
}

function timeoutErrorRule(): NonNullable<
  OperationSpec['responsePolicy']['error']
>['rules'][number] {
  return {
    failureKind: 'timeout',
    behavior: 'return',
    code: 'timeout',
    message: 'Timed out.',
    recoverable: true,
  };
}

export function modelActionSchema(): JsonSchema {
  return {
    type: 'object',
    required: ['action', 'subject'],
    additionalProperties: false,
    properties: {
      action: { type: 'string', enum: ['createTicket'] },
      subject: { type: 'string', minLength: 1 },
    },
  };
}

export function securityPolicy(
  overrides: Partial<OperationSpec['securityPolicy']> = {},
): OperationSpec['securityPolicy'] {
  return {
    allowedHosts: ['api.example.test'],
    allowedMethods: ['POST'],
    blockedRequestHeaders: [],
    redactedRequestPaths: [],
    redactedResponsePaths: [],
    ...overrides,
  };
}
