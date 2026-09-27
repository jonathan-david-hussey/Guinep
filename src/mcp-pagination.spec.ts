import { paginate, paginationOf } from './mcp-pagination.js';

describe('MCP pagination', () => {
  it('paginates items with an opaque cursor', () => {
    const first = paginate(['a', 'b', 'c'], { limit: 2, offset: 0 });

    expect(first.items).toEqual(['a', 'b']);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = paginate(
      ['a', 'b', 'c'],
      paginationOf(firstPageParams(first)),
    );
    expect(second).toEqual({ items: ['c'] });
  });

  it('bounds invalid or extreme limits', () => {
    expect(paginationOf({ limit: 0 })).toMatchObject({ limit: 100, offset: 0 });
    expect(paginationOf({ limit: 10_000 })).toMatchObject({
      limit: 500,
      offset: 0,
    });
    expect(paginationOf({ limit: 2 })).toMatchObject({ limit: 2, offset: 0 });
  });
});

function firstPageParams(page: {
  nextCursor?: string;
}): Record<string, unknown> {
  return { cursor: page.nextCursor, limit: 2 };
}
