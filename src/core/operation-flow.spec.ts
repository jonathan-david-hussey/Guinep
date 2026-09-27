import { AuditLogService } from './audit-log.service.js';
import { AuthService } from './auth.service.js';
import type {
  ConnectionSpec,
  JsonObject,
  MappedHttpRequest,
  OperationSpec,
  UpstreamResult,
} from './contracts.js';
import type { HttpExecutorService } from './http-executor.service.js';
import { InputPolicyService } from './input-policy.service.js';
import { MappingService } from './mapping.service.js';
import { OperationRegistryService } from './operation-registry.service.js';
import {
  type InvokeResult,
  OperationRuntimeService,
} from './operation-runtime.service.js';
import { ResponseService } from './response.service.js';
import { SecurityEventService } from './security-event.service.js';
import { SecurityGuardService } from './security-guard.service.js';
import { SecurityService } from './security.service.js';
import { ValidationService } from './validation.service.js';
import {
  securityPolicy,
  ticketInputSchema,
  ticketResponsePolicy,
} from '../../test/operation-fixtures.js';

describe('operation validation', () => {
  it('accepts valid specs', () => {
    expect(new ValidationService().validateSpec(validSpec())).toEqual([]);
  });

  it('rejects invalid methods and empty allowed hosts', () => {
    const spec = validSpec({
      request: {
        ...validSpec().request,
        method: 'TRACE' as OperationSpec['request']['method'],
      },
      securityPolicy: { ...validSpec().securityPolicy, allowedHosts: [] },
    });

    expect(codes(new ValidationService().validateSpec(spec))).toEqual([
      'invalid_method',
      'empty',
      'method_not_allowed',
    ]);
  });

  it('rejects inline secrets and missing credential refs', () => {
    const spec = validSpec({
      authPolicy: { type: 'bearer', tokenRef: '' },
      displayName: 'token abc123',
    });

    expect(codes(new ValidationService().validateSpec(spec))).toEqual([
      'missing_ref',
      'inline_secret',
    ]);
  });

  it('rejects auth policies whose refs are absent from a connection', () => {
    const connection = { ...validConnection(), secrets: {} };

    expect(
      codes(new ValidationService().validateSpec(validSpec(), connection)),
    ).toEqual(['missing_ref']);
  });

  it('validates required input, types, and string lengths', () => {
    const validation = new ValidationService();
    const spec = validSpec();

    expect(codes(validation.validateInput(spec, {}))).toContain('required');
    expect(codes(validation.validateInput(spec, { subject: 1 }))).toContain(
      'type',
    );
    expect(codes(validation.validateInput(spec, { subject: '' }))).toContain(
      'minLength',
    );
  });
});

describe('request mapping and security', () => {
  it('maps path, query, header, body, and defaults', () => {
    const mapped = mapValidRequest({ ticketId: 10, subject: 'Need help' });
    expect(mapped.url.pathname).toBe('/tickets/10');
    expect(mapped.url.searchParams.get('priority')).toBe('normal');
    expect(mapped.headers['X-Trace-Id']).toBe('generated');
    expect(mapped.body).toEqual({ subject: 'Need help' });
  });

  it('fails closed on invalid transforms', () => {
    const spec = validSpec({
      request: {
        ...validSpec().request,
        mappings: [
          { from: '$.ticketId', to: 'path.ticketId', transform: 'integer' },
        ],
      },
    });

    const result = new MappingService().mapRequest(
      spec,
      { ticketId: '1.2' },
      validConnection(),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects blocked mapped headers and unapproved hosts', () => {
    const spec = validSpec({
      request: {
        ...validSpec().request,
        mappings: [{ from: '$.subject', to: 'header.Authorization' }],
      },
      securityPolicy: {
        ...validSpec().securityPolicy,
        allowedHosts: ['example.com'],
      },
    });

    const mapped = new MappingService().mapRequest(
      spec,
      { subject: 'x' },
      validConnection(),
    );
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(
        codes(new SecurityService().validateRequest(spec, mapped.request)),
      ).toEqual(['host_not_allowed', 'blocked_header']);
    }
  });
});

describe('request egress security', () => {
  it('blocks insecure schemes and private network targets by default', () => {
    const spec = validSpec({
      securityPolicy: {
        ...validSpec().securityPolicy,
        allowedHosts: ['127.0.0.1'],
        blockedRequestHeaders: [],
      },
    });

    expect(
      codes(
        new SecurityService().validateRequest(
          spec,
          mappedRequest('http://127.0.0.1/tickets'),
        ),
      ),
    ).toEqual(['scheme_not_allowed', 'private_network_not_allowed']);
  });

  it('allows private HTTP targets only when explicitly configured', () => {
    const spec = validSpec({
      securityPolicy: {
        ...validSpec().securityPolicy,
        allowedHosts: ['127.0.0.1'],
        allowedSchemes: ['http'],
        allowPrivateNetwork: true,
        blockedRequestHeaders: [],
      },
    });

    expect(
      new SecurityService().validateRequest(
        spec,
        mappedRequest('http://127.0.0.1/tickets'),
      ),
    ).toEqual([]);
  });
});

describe('runtime registry and responses', () => {
  it('does not invoke unpublished operations', async () => {
    const runtime = runtimeWithExecutor(successExecutor({ id: 1 }));

    await expect(
      runtime.invokePublished('helpdesk.createTicket.v1', {}),
    ).resolves.toEqual({
      ok: false,
      failures: [
        {
          path: '$.operationId',
          code: 'unpublished',
          message: 'Operation helpdesk.createTicket.v1 is not published.',
        },
      ],
    });
  });

  it('returns a default request failure response before dispatch', async () => {
    await assertDefaultRequestFailureResponse();
  });

  it('returns a custom request failure response for security failures', async () => {
    await assertCustomSecurityFailureResponse();
  });
});

describe('response shaping', () => {
  it('unwraps, includes, excludes, redacts, maps, and limits success responses', () => {
    const response = new ResponseService().shapeSuccess(transformSpec(), {
      ok: true,
      status: 200,
      headers: {},
      body: {
        data: [
          { id: 1, secret: 'a', ignored: true },
          { id: 2, secret: 'b', ignored: true },
        ],
      },
    });

    expect(response.data).toEqual([{ id: 1, secret: '[REDACTED]' }]);
  });

  it('always applies security redaction to successful responses', () => {
    const response = new ResponseService().shapeSuccess(
      validSpec({
        responsePolicy: {
          success: {
            include: ['$.ticket.id', '$.secret', '$.nested.apiToken'],
          },
        },
      }),
      {
        ok: true,
        status: 200,
        headers: {},
        body: {
          ticket: { id: 1 },
          secret: 'server-side-secret',
          nested: { apiToken: 'token' },
        },
      },
    );

    expect(response.data).toEqual({
      ticket: { id: 1 },
      secret: '[REDACTED]',
      nested: { apiToken: '[REDACTED]' },
    });
  });

  it('maps 404 and 5XX errors to configured recoverable responses', () => {
    const responses = new ResponseService();
    const notFound = responses.shapeFailure(validSpec(), httpError(404));
    const unavailable = responses.shapeFailure(validSpec(), httpError(503));

    expect(notFound).toMatchObject({
      status: 200,
      providerStatus: 404,
      recoverable: true,
    });
    expect(unavailable).toMatchObject({
      status: 200,
      providerStatus: 503,
      code: 'upstream_retryable',
    });
  });
});

describe('audit logging', () => {
  it('redacts secret-derived headers, query values, and request paths in audit logs', () => {
    const audit = new AuditLogService();
    const request = mappedRequest(
      'https://api.example.test/tickets?api_key=secret',
    );
    request.body = { password: 'secret', nested: { accessToken: 'token' } };

    audit.recordRequest(
      'op',
      request,
      ['Authorization'],
      ['api_key'],
      ['$.password'],
    );

    expect(audit.list()).toEqual([
      {
        operationId: 'op',
        method: 'POST',
        url: 'https://api.example.test/tickets?api_key=%5BREDACTED%5D',
        headers: { Authorization: '[REDACTED]' },
        body: {
          password: '[REDACTED]',
          nested: { accessToken: '[REDACTED]' },
        },
      },
    ]);
  });
});

function runtimeWithExecutor(
  executor: HttpExecutorService,
): OperationRuntimeService {
  const validation = new ValidationService();
  return new OperationRuntimeService(
    new OperationRegistryService(validation),
    newConnectionService(),
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

function successExecutor(body: unknown): HttpExecutorService {
  return {
    execute: () =>
      Promise.resolve({ ok: true, status: 200, headers: {}, body }),
  } as unknown as HttpExecutorService;
}

async function assertDefaultRequestFailureResponse(): Promise<void> {
  const harness = runtimeHarnessWithCountingExecutor(successResult());
  const spec = defaultRequestFailureSpec();
  harness.registry.createDraft(spec);
  harness.registry.publishDraft(spec.id);

  const result = await harness.runtime.invokePublished(
    'helpdesk.createTicket.v1',
    {},
  );

  expect(result).toEqual(defaultRequestFailureResult());
  expect(harness.calls()).toBe(0);
}

async function assertCustomSecurityFailureResponse(): Promise<void> {
  const harness = runtimeHarnessWithCountingExecutor(successResult());
  const spec = customSecurityFailureSpec();
  harness.registry.createDraft(spec);
  harness.registry.publishDraft(spec.id);

  const result = await harness.runtime.invokePublished(
    'helpdesk.createTicket.v1',
    { subject: 'Need help', ticketId: 1 },
  );

  expect(result).toMatchObject(customSecurityFailureResult());
  expect(harness.calls()).toBe(0);
}

function runtimeHarnessWithCountingExecutor(result: UpstreamResult): {
  registry: OperationRegistryService;
  runtime: OperationRuntimeService;
  calls: () => number;
} {
  let calls = 0;
  const executor = {
    execute: () => {
      calls += 1;
      return Promise.resolve(result);
    },
  } as unknown as HttpExecutorService;

  const validation = new ValidationService();
  const registry = new OperationRegistryService(validation);
  return {
    registry,
    runtime: operationRuntimeWithRegistry(registry, validation, executor),
    calls: () => calls,
  };
}

function operationRuntimeWithRegistry(
  registry: OperationRegistryService,
  validation: ValidationService,
  executor: HttpExecutorService,
): OperationRuntimeService {
  return new OperationRuntimeService(
    registry,
    newConnectionService(),
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

function successResult(): UpstreamResult {
  return { ok: true, status: 200, headers: {}, body: { ok: true } };
}

function defaultRequestFailureSpec(): OperationSpec {
  return validSpec({
    requestFailurePolicy: {
      mode: 'defaultResponse',
      categories: ['input_schema'],
      code: 'invalid_request',
      message: 'Request input is invalid.',
    },
  });
}

function defaultRequestFailureResult(): InvokeResult {
  return {
    ok: true,
    value: {
      success: false,
      operationId: 'helpdesk.createTicket.v1',
      status: 200,
      recoverable: false,
      code: 'invalid_request',
      message: 'Request input is invalid.',
    },
  };
}

function customSecurityFailureSpec(): OperationSpec {
  return validSpec({
    requestFailurePolicy: {
      mode: 'customResponse',
      categories: ['security'],
      response: {
        code: 'blocked_by_policy',
        message: 'This request is blocked by policy.',
        recoverable: true,
        data: { action: 'revise_request' },
      },
    },
    securityPolicy: {
      ...validSpec().securityPolicy,
      allowedHosts: ['other.example.test'],
    },
  });
}

function customSecurityFailureResult(): InvokeResult {
  return {
    ok: true,
    value: {
      success: false,
      operationId: 'helpdesk.createTicket.v1',
      status: 200,
      recoverable: true,
      code: 'blocked_by_policy',
      message: 'This request is blocked by policy.',
      data: { action: 'revise_request' },
    },
  };
}

function mapValidRequest(input: JsonObject): MappedHttpRequest {
  const result = new MappingService().mapRequest(
    validSpec(),
    input,
    validConnection(),
  );
  if (!result.ok) {
    throw new Error('Expected mapping to succeed.');
  }

  return result.request;
}

function validSpec(overrides: Partial<OperationSpec> = {}): OperationSpec {
  const spec: OperationSpec = {
    id: 'helpdesk.createTicket',
    version: 'v1',
    status: 'draft',
    connectionId: 'helpdesk',
    request: {
      method: 'POST',
      path: '/tickets/{ticketId}',
      contentType: 'json',
      mappings: [
        {
          from: '$.ticketId',
          to: 'path.ticketId',
          required: true,
          transform: 'integer',
        },
        { from: '$.priority', to: 'query.priority', defaultValue: 'normal' },
        {
          from: '$.traceId',
          to: 'header.X-Trace-Id',
          defaultValue: 'generated',
        },
        { from: '$.subject', to: 'body.subject', required: true },
      ],
    },
    inputSchema: ticketInputSchema(1),
    authPolicy: {
      type: 'apiKeyHeader',
      headerName: 'X-Api-Key',
      credentialRef: 'connection.apiKey',
    },
    responsePolicy: ticketResponsePolicy({
      retryMessage: 'Try again later.',
    }),
    securityPolicy: securityPolicy({
      blockedRequestHeaders: ['Authorization'],
      redactedRequestPaths: ['$.password'],
      redactedResponsePaths: ['$.secret'],
    }),
  };

  return { ...spec, ...overrides };
}

function transformSpec(): OperationSpec {
  return validSpec({
    responsePolicy: {
      success: {
        unwrap: '$.data',
        include: ['$.id', '$.secret'],
        exclude: ['$.ignored'],
        redact: ['$.secret'],
        limit: 1,
      },
    },
  });
}

function validConnection(): ConnectionSpec {
  return {
    id: 'helpdesk',
    baseUrl: 'https://api.example.test',
    secrets: { apiKey: 'secret' },
  };
}

function newConnectionService(): never {
  const service = {
    getConnection: () => validConnection(),
  };
  return service as never;
}

function httpError(status: number): Exclude<UpstreamResult, { ok: true }> {
  return { ok: false, status, headers: {}, body: {}, failureKind: 'http' };
}

function mappedRequest(url: string): MappedHttpRequest {
  return {
    method: 'POST',
    url: new URL(url),
    headers: { Authorization: 'Bearer secret' },
    body: { password: 'secret' },
    contentType: 'json',
    timeoutMs: 1_000,
  };
}

function codes(failures: { code: string }[]): string[] {
  return failures.map((failure) => failure.code);
}
