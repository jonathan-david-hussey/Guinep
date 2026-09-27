import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http';
import { type AddressInfo } from 'node:net';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { ConnectionService } from './../src/core/connection.service.js';
import {
  type ConnectionSpec,
  type OperationSpec,
} from './../src/core/contracts.js';
import {
  ticketInputSchema,
  ticketResponsePolicy,
} from './operation-fixtures.js';

interface ApiResponse {
  ok: boolean;
  value?: unknown;
  errors?: unknown[];
}

interface MockUpstream {
  url: string;
  calls: () => number;
  close: () => Promise<void>;
}

interface StartedApp {
  app: INestApplication;
  upstream: MockUpstream;
  reset: (
    handler: UpstreamHandler,
    secrets?: Record<string, string>,
  ) => Promise<void>;
}

type UpstreamHandler = (
  req: IncomingMessage,
  body: string,
  res: ServerResponse,
) => void;

describe('Guinep health API (e2e)', () => {
  const state = useStartedApp(jsonTicketHandler);

  it('/ (GET)', async (): Promise<void> => {
    await request(server(state.app))
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});

describe('Guinep form operation API (e2e)', () => {
  const state = useStartedApp(formHandler);

  it('executes form-urlencoded POST operations', async () => {
    await createDraft(state.app, formSpec(state.upstream.url));
    await publishDraft(state.app);
    const invoked = await invoke(state.app, 'helpdesk.createTicket.v1', {
      subject: 'Need help',
    });

    expect(operationResponse(invoked)).toMatchObject({ success: true });
  });
});

describe('Guinep operation API error handling (e2e)', () => {
  const state = useStartedApp(jsonTicketHandler);

  it('fails validation before upstream calls', async () => {
    await createDraft(state.app, jsonSpec(state.upstream.url));
    await publishDraft(state.app);

    const invoked = await invoke(state.app, 'helpdesk.createTicket.v1', {});

    expect(apiBody(invoked).ok).toBe(false);
    expect(state.upstream.calls()).toBe(0);
  });

  it('converts upstream 404 into a workflow-safe response', async () => {
    await state.reset(notFoundHandler);
    await createDraft(state.app, jsonSpec(state.upstream.url));
    await publishDraft(state.app);

    const invoked = await invoke(state.app, 'helpdesk.createTicket.v1', {
      subject: 'Missing',
    });

    expect(operationResponse(invoked)).toMatchObject({
      success: false,
      status: 200,
      providerStatus: 404,
      code: 'not_found',
    });
    expect(JSON.stringify(apiBody(invoked))).not.toContain('provider secret');
  });
});

describe('Guinep operation API retry and auth errors (e2e)', () => {
  const state = useStartedApp(jsonTicketHandler);

  it('retries upstream 503 then returns a recoverable envelope', async () => {
    await state.reset(unavailableHandler);
    await createDraft(state.app, jsonSpec(state.upstream.url));
    await publishDraft(state.app);

    const invoked = await invoke(state.app, 'helpdesk.createTicket.v1', {
      subject: 'Retry',
    });

    expect(operationResponse(invoked)).toMatchObject({
      success: false,
      status: 200,
      providerStatus: 503,
      code: 'upstream_retryable',
    });
    expect(state.upstream.calls()).toBe(2);
  });

  it('converts timeouts through the error policy', async () => {
    await state.reset(timeoutHandler);
    await createDraft(
      state.app,
      jsonSpec(state.upstream.url, { timeoutMs: 25 }),
    );
    await publishDraft(state.app);

    const invoked = await invoke(state.app, 'helpdesk.createTicket.v1', {
      subject: 'Slow',
    });

    expect(operationResponse(invoked)).toMatchObject({
      success: false,
      status: 200,
      code: 'timeout',
    });
  });

  it('rejects missing auth secrets before upstream calls', async () => {
    await state.reset(jsonTicketHandler, {});
    await createDraft(state.app, jsonSpec(state.upstream.url));
    await publishDraft(state.app);

    const invoked = await invoke(state.app, 'helpdesk.createTicket.v1', {
      subject: 'No auth',
    });

    expect(apiBody(invoked).ok).toBe(false);
    expect(state.upstream.calls()).toBe(0);
  });
});

function useStartedApp(
  handler: UpstreamHandler,
  secrets: Record<string, string> = { apiKey: 'secret' },
): StartedApp {
  const state = {
    reset: async (
      nextHandler: UpstreamHandler,
      nextSecrets: Record<string, string> = { apiKey: 'secret' },
    ) => {
      await closeStartedApp(state.app, state.upstream);
      Object.assign(state, await createStartedApp(nextHandler, nextSecrets));
    },
  } as StartedApp;

  beforeEach(async () => {
    Object.assign(state, await createStartedApp(handler, secrets));
  });
  afterEach(async () => {
    await closeStartedApp(state.app, state.upstream);
  });
  return state;
}

async function createStartedApp(
  handler: UpstreamHandler,
  secrets: Record<string, string> = { apiKey: 'secret' },
): Promise<{ app: INestApplication; upstream: MockUpstream }> {
  process.env['NODE_ENV'] = 'test';
  process.env['GUINEP_ADMIN_KEY'] = 'admin';
  process.env['GUINEP_API_KEY'] = 'invoke';
  delete process.env['GUINEP_CONFIG_JSON'];
  const upstream = await startUpstream(handler);
  return {
    app: await createApp(upstream.url, secrets),
    upstream,
  };
}

async function closeStartedApp(
  app: INestApplication,
  upstream: MockUpstream,
): Promise<void> {
  await app.close();
  await upstream.close();
}

async function createApp(
  baseUrl: string,
  secrets: Record<string, string>,
): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication();
  moduleFixture
    .get(ConnectionService)
    .setConnection(connection(baseUrl, secrets));
  await app.init();
  return app;
}

async function createDraft(
  app: INestApplication,
  spec: OperationSpec,
): Promise<void> {
  await request(server(app))
    .post('/v1/operation-specs/drafts')
    .set('x-guinep-admin-key', 'admin')
    .send(spec)
    .expect(201);
}

async function publishDraft(app: INestApplication): Promise<void> {
  await request(server(app))
    .post('/v1/operation-specs/drafts/helpdesk.createTicket/publish')
    .set('x-guinep-admin-key', 'admin')
    .expect(201);
}

async function invoke(
  app: INestApplication,
  operationId: string,
  input: Record<string, unknown>,
): Promise<request.Response> {
  return request(server(app))
    .post(`/v1/operations/${operationId}/invoke`)
    .set('x-guinep-api-key', 'invoke')
    .send({ input })
    .expect(200);
}

function jsonSpec(
  baseUrl: string,
  requestOverrides: Partial<OperationSpec['request']> = {},
): OperationSpec {
  const host = new URL(baseUrl).hostname;
  return {
    id: 'helpdesk.createTicket',
    version: 'v1',
    status: 'draft',
    connectionId: 'mock',
    request: {
      method: 'POST',
      path: '/tickets',
      contentType: 'json',
      timeoutMs: 1_000,
      mappings: [{ from: '$.subject', to: 'body.subject', required: true }],
      ...requestOverrides,
    },
    inputSchema: ticketInputSchema(1),
    authPolicy: {
      type: 'apiKeyHeader',
      headerName: 'X-Api-Key',
      credentialRef: 'connection.apiKey',
    },
    responsePolicy: ticketResponsePolicy({ includeTimeout: true }),
    securityPolicy: {
      allowedHosts: [host],
      allowedSchemes: ['http'],
      allowPrivateNetwork: true,
      allowedMethods: ['POST'],
      blockedRequestHeaders: ['Authorization'],
      redactedRequestPaths: [],
      redactedResponsePaths: ['$.secret'],
    },
    retryPolicy: { maxAttempts: 2, statusRanges: [{ min: 500, max: 599 }] },
  };
}

function formSpec(baseUrl: string): OperationSpec {
  return jsonSpec(baseUrl, {
    contentType: 'form-urlencoded',
    mappings: [{ from: '$.subject', to: 'body.subject', required: true }],
  });
}

function connection(
  baseUrl: string,
  secrets: Record<string, string>,
): ConnectionSpec {
  return { id: 'mock', baseUrl, secrets };
}

function server(app: INestApplication): HttpServer {
  return app.getHttpServer() as HttpServer;
}

function apiBody(response: { body: unknown }): ApiResponse {
  return response.body as ApiResponse;
}

function operationResponse(response: {
  body: unknown;
}): Record<string, unknown> {
  const body = apiBody(response);
  return body.value as Record<string, unknown>;
}

async function startUpstream(handler: UpstreamHandler): Promise<MockUpstream> {
  let calls = 0;
  const server = createServer((req, res) => {
    calls += 1;
    void readBody(req).then((body) => {
      handler(req, body, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(address.port)}`,
    calls: () => calls,
    close: closeServer(server),
  };
}

function closeServer(server: HttpServer): () => Promise<void> {
  return async () => {
    return new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error === undefined) {
          resolve();
        } else {
          reject(error);
        }
      });
    });
  };
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(toBytes(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

function toBytes(chunk: unknown): Uint8Array {
  if (typeof chunk === 'string') {
    return Buffer.from(chunk);
  }

  return chunk instanceof Uint8Array ? chunk : Buffer.from([]);
}

function jsonTicketHandler(
  req: IncomingMessage,
  body: string,
  res: ServerResponse,
): void {
  expect(req.headers['x-api-key']).toBe('secret');
  const parsed = JSON.parse(body) as { subject: string };
  writeJson(res, 201, {
    ticket: { id: 'T-1', subject: parsed.subject },
    raw: 'hidden',
  });
}

function formHandler(
  req: IncomingMessage,
  body: string,
  res: ServerResponse,
): void {
  expect(req.headers['content-type']).toContain(
    'application/x-www-form-urlencoded',
  );
  expect(new URLSearchParams(body).get('subject')).toBe('Need help');
  writeJson(res, 200, { ticket: { id: 'F-1', subject: 'Need help' } });
}

function notFoundHandler(
  _req: IncomingMessage,
  _body: string,
  res: ServerResponse,
): void {
  writeJson(res, 404, {
    message: 'raw provider error',
    secret: 'provider secret',
  });
}

function unavailableHandler(
  _req: IncomingMessage,
  _body: string,
  res: ServerResponse,
): void {
  writeJson(res, 503, { message: 'down' });
}

function timeoutHandler(
  _req: IncomingMessage,
  _body: string,
  res: ServerResponse,
): void {
  setTimeout(() => {
    writeJson(res, 200, { ok: true });
  }, 100);
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}
