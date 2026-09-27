import type { HttpService } from '@nestjs/axios';
import { UnauthorizedException } from '@nestjs/common';
import {
  AxiosError,
  AxiosHeaders,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios';
import { of, throwError } from 'rxjs';
import { ApiKeyService } from '../api-key.service.js';
import { OperationSpecsController } from '../operation-specs.controller.js';
import { AuthService } from './auth.service.js';
import { ConnectionService } from './connection.service.js';
import {
  type ConnectionSpec,
  type MappedHttpRequest,
  type OperationSpec,
  type UpstreamResult,
} from './contracts.js';
import { HttpExecutorService } from './http-executor.service.js';
import { MappingService } from './mapping.service.js';
import { OperationRegistryService } from './operation-registry.service.js';
import type { OperationRuntimeService } from './operation-runtime.service.js';
import { ResponseService } from './response.service.js';
import { SecurityEventService } from './security-event.service.js';
import { ToolSchemaService } from './tool-schema.service.js';
import { ValidationService } from './validation.service.js';
import {
  inputSchema,
  operationSpec,
  runtimeHarness as createRuntimeHarness,
  securityPolicy,
  ticketRequest,
} from '../../test/operation-fixtures.js';
import {
  cloneJson,
  deletePath,
  hasPath,
  readPath,
  writePath,
} from './path-utils.js';
import { normalizeHeader, redactQuery, redactValue } from './redaction.js';

describe('service branch coverage', () => {
  it('applies every auth policy and reports missing secrets', () => {
    const auth = new AuthService();
    expect(auth.applyAuth(request(), { type: 'none' }, connection()).ok).toBe(
      true,
    );
    expect(auth.applyAuth(request(), headerPolicy(), connection()).ok).toBe(
      true,
    );
    expect(auth.applyAuth(request(), queryPolicy(), connection()).ok).toBe(
      true,
    );
    expect(auth.applyAuth(request(), basicPolicy(), connection()).ok).toBe(
      true,
    );
    expect(auth.applyAuth(request(), bearerPolicy(), connection()).ok).toBe(
      true,
    );
    expect(
      auth.applyAuth(request(), bearerPolicy(), {
        ...connection(),
        secrets: {},
      }).ok,
    ).toBe(false);
  });

  it('loads connections from environment JSON', () => {
    process.env['GUINEP_CONNECTIONS'] = JSON.stringify([connection()]);

    expect(new ConnectionService().getConnection('mock')).toMatchObject({
      id: 'mock',
    });

    delete process.env['GUINEP_CONNECTIONS'];
  });

  it('requires API keys outside test mode', () => {
    delete process.env['GUINEP_ADMIN_KEY'];
    delete process.env['GUINEP_API_KEY'];
    process.env['NODE_ENV'] = 'production';

    expect(() => new ApiKeyService()).toThrow('GUINEP_ADMIN_KEY');
  });

  it('normalizes executor success, HTTP, network, and timeout results', async () => {
    await expect(
      executorWith(response(200)).execute(request(), undefined),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      executorWith(response(503)).execute(request(), undefined),
    ).resolves.toMatchObject({ ok: false, status: 503 });
    await expect(
      executorWithError(new Error('closed')).execute(request(), undefined),
    ).resolves.toMatchObject({
      failureKind: 'network',
    });
    await expect(
      executorWithError(new AxiosError('slow', 'ECONNABORTED')).execute(
        request(),
        undefined,
      ),
    ).resolves.toEqual({
      ok: false,
      failureKind: 'timeout',
    });
  });
});

describe('connection service integrity', () => {
  it('deep-clones connection specs at service boundaries', () => {
    const service = new ConnectionService();
    const source = connection();

    service.setConnection(source);
    source.secrets['apiKey'] = 'tampered';
    expect(service.getConnection('mock')?.secrets['apiKey']).toBe('secret');

    const returned = service.getConnection('mock');
    if (returned !== undefined) {
      returned.secrets['apiKey'] = 'also-tampered';
    }

    expect(service.getConnection('mock')?.secrets['apiKey']).toBe('secret');
  });
});

describe('mapping and helper branch coverage', () => {
  it('retries configured statuses and sends form-encoded bodies', async () => {
    const configs: AxiosRequestConfig[] = [];
    const executor = executorWithResponses(
      [response(503), response(200)],
      configs,
    );

    await expect(
      executor.execute(formRequest(), retryPolicy()),
    ).resolves.toMatchObject({ ok: true });

    expect(configs).toHaveLength(2);
    expect(configs[0]?.data).toBe('subject=hello');
  });

  it('covers path helpers and redaction edge cases', () => {
    const target: Record<string, unknown> = {};
    writePath(target, '$.a.b', 1);
    expect(readPath(target, '$.a.b')).toBe(1);
    expect(hasPath(target, '$.missing')).toBe(false);
    expect(readPath(1, '$.a')).toBeUndefined();
    expect(cloneJson(undefined)).toBeUndefined();
    deletePath(target, '$.a.b');
    expect(target).toEqual({ a: {} });
    expect(redactValue([{ secret: 'x' }], ['$.secret'])).toEqual([
      { secret: '[REDACTED]' },
    ]);
    expect(
      redactQuery(new URL('https://x.test?a=1'), ['missing']).toString(),
    ).toBe('https://x.test/?a=1');
    expect(normalizeHeader(' Authorization ')).toBe('authorization');
  });

  it('covers optional mappings, transforms, and unmapped destinations', () => {
    const mapped = new MappingService().mapRequest(
      mappingSpec(),
      mappingInput(),
      connection(),
    );

    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.request.url.searchParams.get('count')).toBe('2');
      expect(mapped.request.url.searchParams.get('enabled')).toBe('true');
      expect(mapped.request.headers['X-Object']).toBe('{"a":1}');
    }
  });
});

describe('controller and runtime branch coverage', () => {
  it('runs a published operation through the runtime', async () => {
    const runtime = runtimeHarness({
      ok: true,
      status: 200,
      headers: {},
      body: { id: 1 },
    });
    expect(runtime.registry.createDraft(spec()).ok).toBe(true);
    expect(runtime.registry.publishDraft('op').ok).toBe(true);

    const result = await runtime.runtime.invokePublished('op.v1', {
      subject: 'hello',
    });

    expect(result).toMatchObject({ ok: true, value: { success: true } });
  });

  it('uses default and body-matched failure envelopes', () => {
    const responses = new ResponseService();
    expect(
      responses.shapeFailure(spec(), { ok: false, failureKind: 'network' }),
    ).toMatchObject({
      status: 502,
      code: 'upstream_network',
    });
    expect(
      responses.shapeFailure(bodyRuleSpec(), bodyRuleResult()),
    ).toMatchObject({
      status: 200,
      code: 'known_error',
    });
  });

  it('covers controller methods and unauthorized guards', async () => {
    const controller = controllerHarness();
    expect(() => controller.createDraft('wrong', spec())).toThrow(
      UnauthorizedException,
    );
    expect(controller.createDraft('admin', spec())).toMatchObject({ ok: true });
    expect(controller.getDraft('admin', 'op')).toMatchObject({ id: 'op' });
    expect(controller.validateDraft('admin', 'op')).toMatchObject({ ok: true });
    expect(controller.publishDraft('admin', 'op')).toMatchObject({ ok: true });
    expect(controller.listOperations('invoke')).toMatchObject({
      operations: [expect.objectContaining({ id: 'op' })],
    });
    expect(controller.listSecurityEvents('admin')).toEqual({ events: [] });
    expect(controller.getOperation('invoke', 'op.v1')).toMatchObject({
      id: 'op',
    });
    expect(controller.getToolSchema('invoke', 'op.v1')).toMatchObject({
      operationId: 'op.v1',
    });
    await expect(
      controller.invokeOperation('invoke', 'op.v1', {
        input: { subject: 'x' },
      }),
    ).resolves.toMatchObject({
      ok: true,
    });
  });

  it('updates drafts and returns not-found registry failures', () => {
    const registry = new OperationRegistryService(new ValidationService());
    expect(registry.updateDraft('missing', spec()).ok).toBe(false);
    expect(registry.createDraft(spec()).ok).toBe(true);
    expect(
      registry.updateDraft('op', { ...spec(), displayName: 'Updated' }).ok,
    ).toBe(true);
    expect(registry.getPublished('missing')).toBeUndefined();
  });
});

function runtimeHarness(result: UpstreamResult): {
  registry: OperationRegistryService;
  runtime: OperationRuntimeService;
} {
  return createRuntimeHarness(result, connection());
}

function controllerHarness(): OperationSpecsController {
  process.env['NODE_ENV'] = 'test';
  process.env['GUINEP_ADMIN_KEY'] = 'admin';
  process.env['GUINEP_API_KEY'] = 'invoke';
  const harness = runtimeHarness({
    ok: true,
    status: 200,
    headers: {},
    body: { ok: true },
  });
  return new OperationSpecsController(
    new ApiKeyService(),
    harness.registry,
    harness.runtime,
    new ToolSchemaService(),
    new SecurityEventService(),
  );
}

function executorWith(response: AxiosResponse): HttpExecutorService {
  const http = { request: () => of(response) } as unknown as HttpService;
  return new HttpExecutorService(http);
}

function executorWithError(error: unknown): HttpExecutorService {
  const http = {
    request: () => throwError(() => error),
  } as unknown as HttpService;
  return new HttpExecutorService(http);
}

function executorWithResponses(
  responses: AxiosResponse[],
  configs: AxiosRequestConfig[],
): HttpExecutorService {
  let index = 0;
  const http = {
    request: (config: AxiosRequestConfig) => {
      configs.push(config);
      const response = responses[index] ?? responses.at(-1);
      index += 1;
      return of(response);
    },
  } as unknown as HttpService;
  return new HttpExecutorService(http);
}

function response(status: number): AxiosResponse {
  return {
    config: { headers: new AxiosHeaders() },
    data: { ok: status < 300 },
    headers: {},
    status,
    statusText: String(status),
  };
}

function request(): MappedHttpRequest {
  return {
    method: 'POST',
    url: new URL('https://api.example.test/tickets'),
    headers: {},
    body: { subject: 'hello' },
    contentType: 'json',
    timeoutMs: 1_000,
  };
}

function formRequest(): MappedHttpRequest {
  return { ...request(), contentType: 'form-urlencoded' };
}

function retryPolicy(): OperationSpec['retryPolicy'] {
  return { maxAttempts: 2, statusRanges: [{ min: 500, max: 599 }] };
}

function spec(): OperationSpec {
  return operationSpec({
    id: 'op',
    request: ticketRequest(),
    inputSchema: inputSchema(),
    authPolicy: headerPolicy(),
    responsePolicy: { success: { include: ['$.id'] } },
    securityPolicy: securityPolicy({
      blockedRequestHeaders: ['Authorization'],
    }),
  });
}

function mappingSpec(): OperationSpec {
  return {
    ...spec(),
    request: {
      ...spec().request,
      mappings: [
        { from: '$.missing', to: 'ignored.optional' },
        { from: '$.count', to: 'query.count', transform: 'number' },
        { from: '$.enabled', to: 'query.enabled', transform: 'boolean' },
        { from: '$.object', to: 'header.X-Object', transform: 'jsonStringify' },
        { from: '$.subject', to: 'body.subject', transform: 'string' },
      ],
    },
  };
}

function mappingInput(): Record<string, unknown> {
  return {
    count: '2',
    enabled: 'true',
    object: { a: 1 },
    subject: 123,
  };
}

function bodyRuleSpec(): OperationSpec {
  return {
    ...spec(),
    responsePolicy: {
      error: {
        rules: [
          {
            bodyPath: '$.error.code',
            bodyEquals: 'known',
            behavior: 'return',
            code: 'known_error',
            message: 'Known error.',
          },
        ],
      },
    },
  };
}

function bodyRuleResult(): Exclude<UpstreamResult, { ok: true }> {
  return {
    ok: false,
    status: 400,
    headers: {},
    body: { error: { code: 'known' } },
    failureKind: 'http',
  };
}

function connection(): ConnectionSpec {
  return {
    id: 'mock',
    baseUrl: 'https://api.example.test',
    secrets: {
      apiKey: 'secret',
      password: 'pass',
      token: 'token',
      username: 'user',
    },
  };
}

function headerPolicy(): OperationSpec['authPolicy'] {
  return {
    type: 'apiKeyHeader',
    headerName: 'X-Api-Key',
    credentialRef: 'connection.apiKey',
  };
}

function queryPolicy(): OperationSpec['authPolicy'] {
  return {
    type: 'apiKeyQuery',
    queryName: 'api_key',
    credentialRef: 'connection.apiKey',
  };
}

function basicPolicy(): OperationSpec['authPolicy'] {
  return {
    type: 'basic',
    usernameRef: 'connection.username',
    passwordRef: 'connection.password',
  };
}

function bearerPolicy(): OperationSpec['authPolicy'] {
  return { type: 'bearer', tokenRef: 'connection.token' };
}
