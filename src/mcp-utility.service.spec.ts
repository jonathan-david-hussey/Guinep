import { ModelOutputGuardService } from './core/model-output-guard.service.js';
import { OutputSafetyService } from './core/output-safety.service.js';
import { McpUtilityService } from './mcp-utility.service.js';

describe('McpUtilityService', () => {
  let service: McpUtilityService;

  beforeEach(() => {
    service = new McpUtilityService(
      new OutputSafetyService(),
      new ModelOutputGuardService(),
    );
  });

  it('lists a broad deterministic request and response utility catalog', () => {
    const names = service.listTools().map((tool) => tool.name);

    expect(names.length).toBeGreaterThanOrEqual(40);
    expect(names).toEqual([...names].sort());
    expect(names).toEqual(
      expect.arrayContaining([
        'guinep_request_pick',
        'guinep_response_failure_envelope',
        'guinep_json_schema_validate',
      ]),
    );
  });

  it('returns structured resolution failures for missing utilities', () => {
    expect(service.callTool('missing', {})).toMatchObject({
      ok: false,
      failures: [{ code: 'tool_not_found' }],
    });
  });

  it('handles representative request and response utilities', () => {
    expect(call('guinep_request_pick', requestPathArgs())).toEqual({
      value: 'Need help',
    });
    expect(call('guinep_request_require_paths', requestPathArgs())).toEqual({
      ok: true,
      missing: [],
    });
    expect(call('guinep_response_redact_paths', responsePathArgs())).toEqual({
      ticket: { id: 'T-1' },
      token: '[REDACTED]',
    });
    expect(call('guinep_response_failure_envelope', failureArgs())).toEqual({
      success: false,
      operationId: 'helpdesk.createTicket.v1',
      status: 200,
      providerStatus: 503,
      recoverable: true,
      code: 'upstream_retryable',
      message: 'Retry later.',
    });
  });

  it('handles every utility with valid arguments', () => {
    for (const tool of service.listTools()) {
      expect(service.callTool(tool.name, argsFor(tool.name))).toMatchObject({
        ok: true,
      });
    }
  });

  function call(name: string, args: Record<string, unknown>): unknown {
    const result = service.callTool(name, args);
    expect(result.ok).toBe(true);
    return result.ok ? result.value : undefined;
  }
});

function argsFor(name: string): Record<string, unknown> {
  if (name.includes('_header_')) {
    return { headers: { 'X-Test': 'yes' }, name: 'x-test', value: 'next' };
  }

  if (name.includes('_query_') || name.includes('_url_')) {
    return urlArgs();
  }

  if (name.includes('_form_')) {
    return { body: { subject: 'Need help' }, text: 'subject=Need+help' };
  }

  return fallbackArgs(name);
}

function fallbackArgs(name: string): Record<string, unknown> {
  if (name.startsWith('guinep_request_')) {
    return requestUtilityArgs(name);
  }

  if (name.startsWith('guinep_response_')) {
    return responseUtilityArgs(name);
  }

  return safetyUtilityArgs(name);
}

function requestUtilityArgs(name: string): Record<string, unknown> {
  if (name === 'guinep_request_json_parse') {
    return { text: '{"subject":"Need help"}' };
  }

  return {
    ...requestPathArgs(),
    value: { ok: true },
    method: 'post',
  };
}

function responseUtilityArgs(name: string): Record<string, unknown> {
  if (name === 'guinep_response_limit_array') {
    return { items: [1, 2, 3], limit: 2 };
  }

  if (name === 'guinep_response_status_class') {
    return { status: 503 };
  }

  if (name === 'guinep_response_from_text') {
    return { text: '{"ok":true}' };
  }

  return {
    ...responsePathArgs(),
    ...failureArgs(),
    data: { ticket: { id: 'T-1' } },
  };
}

function safetyUtilityArgs(name: string): Record<string, unknown> {
  if (name === 'guinep_json_schema_validate') {
    return { value: { ok: true }, schema: { type: 'object' } };
  }

  if (name === 'guinep_model_output_validate') {
    return { output: { ok: true }, schema: { type: 'object' } };
  }

  return {
    content: '<b>safe</b>',
    text: '![x](http://example.test)',
    sink: 'html',
  };
}

function requestPathArgs(): Record<string, unknown> {
  return {
    request: { body: { subject: 'Need help' } },
    path: '$.body.subject',
    paths: ['$.body.subject'],
  };
}

function responsePathArgs(): Record<string, unknown> {
  return {
    response: { ticket: { id: 'T-1' }, token: 'secret' },
    path: '$.ticket.id',
    paths: ['$.token'],
  };
}

function failureArgs(): Record<string, unknown> {
  return {
    operationId: 'helpdesk.createTicket.v1',
    providerStatus: 503,
    recoverable: true,
    code: 'upstream_retryable',
    message: 'Retry later.',
  };
}

function urlArgs(): Record<string, unknown> {
  return {
    url: 'https://api.example.test/tickets?limit=10',
    name: 'limit',
    value: '20',
    allowedHosts: ['api.example.test'],
    allowedSchemes: ['https'],
  };
}
