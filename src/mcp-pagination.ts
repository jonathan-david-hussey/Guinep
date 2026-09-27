import { type JsonObject } from './core/contracts.js';

const defaultLimit = 100;
const maxLimit = 500;

export interface McpPagination {
  limit: number;
  offset: number;
}

export interface McpPage<T> {
  items: T[];
  nextCursor?: string;
}

export function paginationOf(params: JsonObject): McpPagination {
  const limit = boundedLimit(params['limit']);
  return {
    limit,
    offset: cursorOffset(params['cursor']),
  };
}

export function paginate<T>(items: T[], pagination: McpPagination): McpPage<T> {
  const page = items.slice(
    pagination.offset,
    pagination.offset + pagination.limit,
  );
  const nextOffset = pagination.offset + page.length;
  return nextOffset < items.length
    ? { items: page, nextCursor: encodeCursor(nextOffset) }
    : { items: page };
}

function boundedLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return defaultLimit;
  }

  if (value < 1) {
    return defaultLimit;
  }

  return Math.min(value, maxLimit);
}

function cursorOffset(value: unknown): number {
  if (typeof value !== 'string') {
    return 0;
  }

  return decodeCursor(value) ?? 0;
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): number | undefined {
  try {
    const value = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as {
      offset?: unknown;
    };
    return typeof value.offset === 'number' && value.offset >= 0
      ? value.offset
      : undefined;
  } catch {
    return undefined;
  }
}
