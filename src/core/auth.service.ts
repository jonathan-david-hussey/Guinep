import { Injectable } from '@nestjs/common';
import {
  type AuthPolicy,
  type ConnectionSpec,
  type MappedHttpRequest,
  type ValidationFailure,
} from './contracts.js';

export type AuthResult =
  | {
      ok: true;
      request: MappedHttpRequest;
      redactedHeaders: string[];
      redactedQuery: string[];
    }
  | { ok: false; failures: ValidationFailure[] };

@Injectable()
export class AuthService {
  applyAuth(
    request: MappedHttpRequest,
    policy: AuthPolicy,
    connection: ConnectionSpec,
  ): AuthResult {
    switch (policy.type) {
      case 'none':
        return success(request, [], []);
      case 'apiKeyHeader':
        return applyHeaderKey(request, connection, policy);
      case 'apiKeyQuery':
        return applyQueryKey(request, connection, policy);
      case 'basic':
        return applyBasic(request, connection, policy);
      case 'bearer':
        return applyBearer(request, connection, policy);
    }
  }
}

function applyHeaderKey(
  request: MappedHttpRequest,
  connection: ConnectionSpec,
  policy: Extract<AuthPolicy, { type: 'apiKeyHeader' }>,
): AuthResult {
  const secret = resolveSecret(connection, policy.credentialRef);
  if (!secret.ok) {
    return secret;
  }

  return success(
    withHeader(request, policy.headerName, secret.value),
    [policy.headerName],
    [],
  );
}

function applyQueryKey(
  request: MappedHttpRequest,
  connection: ConnectionSpec,
  policy: Extract<AuthPolicy, { type: 'apiKeyQuery' }>,
): AuthResult {
  const secret = resolveSecret(connection, policy.credentialRef);
  if (!secret.ok) {
    return secret;
  }

  const url = new URL(request.url.toString());
  url.searchParams.set(policy.queryName, secret.value);
  return success({ ...request, url }, [], [policy.queryName]);
}

function applyBasic(
  request: MappedHttpRequest,
  connection: ConnectionSpec,
  policy: Extract<AuthPolicy, { type: 'basic' }>,
): AuthResult {
  const username = resolveSecret(connection, policy.usernameRef);
  const password = resolveSecret(connection, policy.passwordRef);
  if (!username.ok) {
    return username;
  }

  if (!password.ok) {
    return password;
  }

  const token = Buffer.from(`${username.value}:${password.value}`).toString(
    'base64',
  );
  return success(
    withHeader(request, 'Authorization', `Basic ${token}`),
    ['Authorization'],
    [],
  );
}

function applyBearer(
  request: MappedHttpRequest,
  connection: ConnectionSpec,
  policy: Extract<AuthPolicy, { type: 'bearer' }>,
): AuthResult {
  const token = resolveSecret(connection, policy.tokenRef);
  if (!token.ok) {
    return token;
  }

  return success(
    withHeader(request, 'Authorization', `Bearer ${token.value}`),
    ['Authorization'],
    [],
  );
}

function resolveSecret(
  connection: ConnectionSpec,
  ref: string,
): { ok: true; value: string } | { ok: false; failures: ValidationFailure[] } {
  if (ref.startsWith('literal:')) {
    return { ok: true, value: ref.slice('literal:'.length) };
  }

  if (!ref.startsWith('connection.')) {
    return missingSecret(ref);
  }

  const value = connection.secrets[ref.slice('connection.'.length)];
  return value === undefined ? missingSecret(ref) : { ok: true, value };
}

function missingSecret(ref: string): {
  ok: false;
  failures: ValidationFailure[];
} {
  return {
    ok: false,
    failures: [
      {
        path: '$.authPolicy',
        code: 'missing_secret',
        message: `Missing secret for ${ref}.`,
      },
    ],
  };
}

function success(
  request: MappedHttpRequest,
  redactedHeaders: string[],
  redactedQuery: string[],
): AuthResult {
  return { ok: true, request, redactedHeaders, redactedQuery };
}

function withHeader(
  request: MappedHttpRequest,
  name: string,
  value: string,
): MappedHttpRequest {
  return { ...request, headers: { ...request.headers, [name]: value } };
}
