import { type ExecutionContext } from './contracts.js';
import { type InvokeResult } from './operation-runtime.service.js';
import { type RegistryResult } from './operation-registry.service.js';

export function defaultContext(
  source: ExecutionContext['source'],
): ExecutionContext {
  return { source };
}

export function missingConnection<T>(connectionId: string): RegistryResult<T> {
  return {
    ok: false,
    failures: [
      {
        path: '$.connectionId',
        code: 'missing_connection',
        message: `Connection ${connectionId} was not found.`,
      },
    ],
  };
}

export function unpublished(operationId: string): InvokeResult {
  return {
    ok: false,
    failures: [
      {
        path: '$.operationId',
        code: 'unpublished',
        message: `Operation ${operationId} is not published.`,
      },
    ],
  };
}
