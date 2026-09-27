import {
  applyResponseControls,
  applyResponseProjection,
  projectionFromRequest,
  responseControlsFromRequest,
} from './response-projection.js';

describe('response projection', () => {
  it('keeps only included fields through arrays of objects', () => {
    expect(
      applyResponseProjection(sampleResponse(), {
        include: ['result.tools.name'],
      }),
    ).toEqual({
      result: {
        tools: [{ name: 'alpha' }, { name: 'beta' }],
      },
    });
  });

  it('accepts JSON-path syntax and [i] array notation', () => {
    expect(
      applyResponseProjection(sampleResponse(), {
        include: ['$.result.tools[i].inputSchema.type'],
      }),
    ).toEqual({
      result: {
        tools: [
          { inputSchema: { type: 'object' } },
          { inputSchema: { type: 'object' } },
        ],
      },
    });
  });

  it('reads projection from body, MCP params, or query include', () => {
    expect(
      projectionFromRequest({ body: { filter: { include: ['tools.name'] } } }),
    ).toEqual({ include: ['tools.name'] });
    expect(
      projectionFromRequest({
        body: { params: { projection: { include: ['result.tools.name'] } } },
      }),
    ).toEqual({ include: ['result.tools.name'] });
    expect(
      projectionFromRequest({ query: { include: 'tools.name,id' } }),
    ).toEqual({
      include: ['tools.name', 'id'],
    });
  });
});

describe('response controls', () => {
  it('applies filters only under result for enveloped responses', () => {
    expect(
      applyResponseControls(
        {
          jsonrpc: '2.0',
          id: 1,
          warnings: [{ active: false, message: 'keep envelope sibling' }],
          result: {
            tools: [
              { name: 'alpha', active: true },
              { name: 'beta', active: false },
            ],
          },
        },
        {
          filters: [{ path: '$.active', equals: true }],
        },
      ),
    ).toEqual({
      jsonrpc: '2.0',
      id: 1,
      warnings: [{ active: false, message: 'keep envelope sibling' }],
      result: {
        tools: [{ name: 'alpha', active: true }],
      },
    });
  });

  it('applies response policy sort before projection on nested arrays', () => {
    expect(
      applyResponseControls(sampleResponse(), {
        sort: [{ path: '$.name', direction: 'desc', type: 'string' }],
        projection: { include: ['result.tools.name'] },
      }),
    ).toEqual({
      result: {
        tools: [{ name: 'beta' }, { name: 'alpha' }],
      },
    });
  });

  it('reads top-level and MCP param response controls', () => {
    expect(
      responseControlsFromRequest({
        body: {
          responsePolicy: {
            success: {
              sort: [{ path: '$.name', direction: 'desc', type: 'string' }],
              limit: 1,
              include: ['result.tools.name'],
            },
          },
        },
      }),
    ).toEqual({
      projection: { include: ['result.tools.name'] },
      sort: [{ path: '$.name', direction: 'desc', type: 'string' }],
      limit: 1,
    });
    expect(
      responseControlsFromRequest({
        body: {
          params: {
            sort: [{ path: '$.name', direction: 'asc', type: 'string' }],
            projection: { include: ['result.tools.name'] },
          },
        },
      }),
    ).toEqual({
      projection: { include: ['result.tools.name'] },
      sort: [{ path: '$.name', direction: 'asc', type: 'string' }],
    });
  });
});

function sampleResponse(): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id: 1,
    result: {
      tools: [
        {
          name: 'alpha',
          description: 'hidden',
          inputSchema: { type: 'object', properties: { hidden: true } },
        },
        {
          name: 'beta',
          description: 'hidden',
          inputSchema: { type: 'object', properties: { hidden: true } },
        },
      ],
    },
  };
}
