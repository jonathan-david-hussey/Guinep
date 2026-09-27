import { type ErrorObject, type ValidateFunction } from 'ajv/dist/ajv.js';
import { type ValidationFailure } from './contracts.js';

export function ajvFailures(
  validate: ValidateFunction,
  defaultMessage: string,
): ValidationFailure[] {
  return (validate.errors ?? []).map((error) => ({
    path: normalizeAjvPath(error),
    code: error.keyword,
    message: error.message ?? defaultMessage,
  }));
}

function normalizeAjvPath(error: ErrorObject): string {
  if (error.instancePath.length === 0) {
    return '$';
  }

  return `$${error.instancePath.replaceAll('/', '.')}`;
}
