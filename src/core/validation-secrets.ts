import { type ValidationFailure } from './contracts.js';
import { isRecord } from './path-utils.js';

export function validateNoInlineSecrets(value: unknown): ValidationFailure[] {
  return findSecretValues(value, '$').map((path) =>
    failure(
      path,
      'inline_secret',
      'Operation specs cannot contain inline secrets.',
    ),
  );
}

function findSecretValues(value: unknown, path: string): string[] {
  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    inspectSecretChild(key, child, `${path}.${key}`),
  );
}

function inspectSecretChild(
  key: string,
  child: unknown,
  path: string,
): string[] {
  if (isSecretKey(key) && isInlineSecretValue(child)) {
    return [path];
  }

  return findSecretValues(child, path);
}

function isSecretKey(key: string): boolean {
  return /secret|password|token|api[-_]?key/i.test(key);
}

function isInlineSecretValue(value: unknown): boolean {
  return typeof value === 'string' && !isCredentialReference(value);
}

function isCredentialReference(value: string): boolean {
  return value.startsWith('connection.') || value.startsWith('literal:');
}

function failure(
  path: string,
  code: string,
  message: string,
): ValidationFailure {
  return { path, code, message };
}
