import { UnauthorizedException } from '@nestjs/common';
import { type JsonObject } from './core/contracts.js';

export type ServiceResult =
  { ok: true; value: unknown } | { ok: false; failures: unknown[] };

export function requireApiKey(
  actual: string | undefined,
  expected: string,
): void {
  if (actual !== expected) {
    throw new UnauthorizedException();
  }
}

export function resultResponse(result: ServiceResult): unknown {
  return result.ok
    ? { ok: true, value: result.value }
    : { ok: false, errors: result.failures };
}

export function objectPropertyOrEmpty<T extends string>(
  value: Partial<Record<T, JsonObject>> | undefined,
  key: T,
): JsonObject {
  return value?.[key] ?? {};
}
