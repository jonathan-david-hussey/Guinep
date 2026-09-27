import { AgentToolService } from './agent-tool.service.js';
import type { OperationSpec, UpstreamResult } from './contracts.js';
import { OperationRegistryService } from './operation-registry.service.js';
import { ToolSchemaService } from './tool-schema.service.js';
import { ValidationService } from './validation.service.js';
import {
  inputSchema,
  runtimeHarness,
  securityPolicy,
} from '../../test/operation-fixtures.js';

describe('agent tool service', () => {
  it('lists published operations as tools and calls one by name', async () => {
    const harness = harnessWith({
      ok: true,
      status: 200,
      headers: {},
      body: { id: 1 },
    });
    publishOperation(harness.registry);

    expect(harness.agentTools.listTools()).toEqual([
      {
        name: 'create_ticket',
        description: 'Create a ticket.',
        inputSchema: inputSchema(),
        operationId: 'helpdesk.createTicket.v1',
      },
    ]);

    await expect(
      harness.agentTools.callTool('create_ticket', { subject: 'Need help' }),
    ).resolves.toMatchObject({ ok: true, value: { success: true } });
  });

  it('returns a structured error for unknown agent tools', async () => {
    const harness = harnessWith({
      ok: true,
      status: 200,
      headers: {},
      body: {},
    });

    await expect(harness.agentTools.callTool('missing', {})).resolves.toEqual({
      ok: false,
      failures: [
        {
          path: '$.toolName',
          code: 'tool_not_found',
          message: 'Agent tool missing was not found.',
        },
      ],
    });
  });

  it('rejects duplicate published tool names', () => {
    const validation = new ValidationService();
    const registry = new OperationRegistryService(validation);

    expect(registry.createDraft(specWithId('first')).ok).toBe(true);
    expect(registry.publishDraft('first').ok).toBe(true);
    expect(registry.createDraft(specWithId('second')).ok).toBe(true);

    expect(registry.publishDraft('second')).toEqual({
      ok: false,
      failures: [
        {
          path: '$.toolPolicy.name',
          code: 'duplicate_tool_name',
          message: 'Tool name is already used by first.v1.',
        },
      ],
    });
  });
});

function harnessWith(result: UpstreamResult): {
  agentTools: AgentToolService;
  registry: OperationRegistryService;
} {
  const harness = runtimeHarness(result);
  return {
    agentTools: new AgentToolService(
      harness.registry,
      harness.runtime,
      new ToolSchemaService(),
    ),
    registry: harness.registry,
  };
}

function publishOperation(registry: OperationRegistryService): void {
  expect(registry.createDraft(spec()).ok).toBe(true);
  expect(registry.publishDraft('helpdesk.createTicket').ok).toBe(true);
}

function spec(): OperationSpec {
  return {
    id: 'helpdesk.createTicket',
    version: 'v1',
    displayName: 'Create a ticket.',
    status: 'draft',
    connectionId: 'mock',
    request: {
      method: 'POST',
      path: '/tickets',
      mappings: [{ from: '$.subject', to: 'body.subject', required: true }],
    },
    inputSchema: inputSchema(),
    toolPolicy: { name: 'create_ticket' },
    executionPolicy: { effects: ['ticket_create'] },
    authPolicy: { type: 'none' },
    responsePolicy: {},
    securityPolicy: securityPolicy(),
  };
}

function specWithId(id: string): OperationSpec {
  return { ...spec(), id };
}
