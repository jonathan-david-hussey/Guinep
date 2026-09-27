import {
  httpMethods,
  type OperationSpec,
  type ValidationFailure,
} from './contracts.js';

export function validateRequest(
  spec: Partial<OperationSpec>,
): ValidationFailure[] {
  const request = spec.request;
  if (request === undefined) {
    return [];
  }

  const failures: ValidationFailure[] = [];
  if (!httpMethods.includes(request.method)) {
    failures.push(
      failure('$.request.method', 'invalid_method', 'Method is not supported.'),
    );
  }

  if (!request.path.startsWith('/') || request.path.includes('://')) {
    failures.push(
      failure('$.request.path', 'raw_url', 'Request path must be relative.'),
    );
  }

  return failures;
}

export function validateSecurity(
  spec: Partial<OperationSpec>,
): ValidationFailure[] {
  const policy = spec.securityPolicy;
  if (policy === undefined) {
    return [
      failure('$.securityPolicy', 'required', 'Security policy is required.'),
    ];
  }

  const failures = validateAllowedHosts(policy.allowedHosts);
  failures.push(
    ...validateAllowedSchemes(
      (policy as { allowedSchemes?: unknown[] }).allowedSchemes ?? [],
    ),
  );
  if (!policy.allowedMethods.includes(spec.request?.method ?? 'GET')) {
    failures.push(methodNotAllowedFailure());
  }

  return failures;
}

function validateAllowedSchemes(schemes: unknown[]): ValidationFailure[] {
  return schemes
    .filter((scheme) => scheme !== 'http' && scheme !== 'https')
    .map((scheme) =>
      failure(
        '$.securityPolicy.allowedSchemes',
        'invalid_scheme',
        `Scheme ${String(scheme)} is not supported.`,
      ),
    );
}

function validateAllowedHosts(hosts: string[]): ValidationFailure[] {
  if (hosts.length > 0) {
    return [];
  }

  return [
    failure(
      '$.securityPolicy.allowedHosts',
      'empty',
      'Allowed hosts cannot be empty.',
    ),
  ];
}

function methodNotAllowedFailure(): ValidationFailure {
  return failure(
    '$.securityPolicy.allowedMethods',
    'method_not_allowed',
    'Request method must be allowed by the security policy.',
  );
}

function failure(
  path: string,
  code: string,
  message: string,
): ValidationFailure {
  return { path, code, message };
}
