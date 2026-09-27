import {
  type AuthPolicy,
  type ConnectionSpec,
  type ValidationFailure,
} from './contracts.js';

export function validateAuth(
  auth: AuthPolicy | undefined,
): ValidationFailure[] {
  if (auth === undefined) {
    return [failure('$.authPolicy', 'required', 'Auth policy is required.')];
  }

  switch (auth.type) {
    case 'none':
      return [];
    case 'apiKeyHeader':
    case 'apiKeyQuery':
      return requireRefs({ credentialRef: auth.credentialRef });
    case 'basic':
      return requireRefs({
        usernameRef: auth.usernameRef,
        passwordRef: auth.passwordRef,
      });
    case 'bearer':
      return requireRefs({ tokenRef: auth.tokenRef });
  }
}

export function validateConnectionRefs(
  auth: AuthPolicy | undefined,
  connection: ConnectionSpec | undefined,
): ValidationFailure[] {
  if (auth === undefined || connection === undefined) {
    return [];
  }

  return credentialRefs(auth)
    .filter((ref) => ref.startsWith('connection.'))
    .filter(
      (ref) =>
        connection.secrets[ref.slice('connection.'.length)] === undefined,
    )
    .map((ref) =>
      failure(
        '$.authPolicy',
        'missing_ref',
        `Missing credential reference ${ref}.`,
      ),
    );
}

function credentialRefs(auth: AuthPolicy): string[] {
  switch (auth.type) {
    case 'none':
      return [];
    case 'apiKeyHeader':
    case 'apiKeyQuery':
      return [auth.credentialRef];
    case 'basic':
      return [auth.usernameRef, auth.passwordRef];
    case 'bearer':
      return [auth.tokenRef];
  }
}

function requireRefs(refs: Record<string, string>): ValidationFailure[] {
  return Object.entries(refs)
    .filter(([, value]) => value.trim().length === 0)
    .map(([key]) =>
      failure(
        `$.authPolicy.${key}`,
        'missing_ref',
        'Credential ref is required.',
      ),
    );
}

function failure(
  path: string,
  code: string,
  message: string,
): ValidationFailure {
  return { path, code, message };
}
