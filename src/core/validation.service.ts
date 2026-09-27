import { Ajv } from 'ajv/dist/ajv.js';
import { Injectable } from '@nestjs/common';
import {
  type ConnectionSpec,
  type InputPolicy,
  type InputValidator,
  type OperationSpec,
  type RequestFailurePolicy,
  type ValidationFailure,
} from './contracts.js';
import { isRecord } from './path-utils.js';
import { ajvFailures } from './ajv-utils.js';
import { validateAuth, validateConnectionRefs } from './validation-auth.js';
import {
  invalidPaths,
  validateExecutionPolicy,
} from './validation-execution.js';
import {
  validateToolMetadata,
  validateToolPolicy,
  validateToolProvenance,
} from './validation-tool.js';
import { validateNoInlineSecrets } from './validation-secrets.js';
import { validateRequest, validateSecurity } from './validation-request.js';

const requestFailureModes = new Set([
  'fail',
  'defaultResponse',
  'customResponse',
]);
const requestFailureCategories = new Set([
  'input_policy',
  'input_schema',
  'mapping',
  'connection',
  'auth',
  'security',
]);

@Injectable()
export class ValidationService {
  private readonly ajv: Ajv;

  public constructor() {
    this.ajv = new Ajv({ allErrors: true, strict: false });
  }

  validateSpec(
    value: unknown,
    connection?: ConnectionSpec,
  ): ValidationFailure[] {
    if (!isRecord(value)) {
      return [
        failure('$', 'invalid_type', 'Operation spec must be an object.'),
      ];
    }

    const spec = value as Partial<OperationSpec>;
    const failures: ValidationFailure[] = [];
    addFailures(failures, validateRequiredSpecFields(spec));
    addFailures(failures, validateRequest(spec));
    addFailures(failures, validateSecurity(spec));
    addFailures(failures, validateAuth(spec.authPolicy));
    addFailures(failures, validateInputPolicy(spec.inputPolicy));
    addFailures(
      failures,
      validateRequestFailurePolicy(spec.requestFailurePolicy),
    );
    addFailures(failures, validateToolPolicy(spec.toolPolicy));
    addFailures(
      failures,
      validateToolProvenance(spec.toolPolicy, spec.executionPolicy),
    );
    addFailures(failures, validateToolMetadata(spec));
    addFailures(failures, validateExecutionPolicy(spec.executionPolicy));
    addFailures(failures, validateConnectionRefs(spec.authPolicy, connection));
    addFailures(failures, validateNoInlineSecrets(value));
    return failures;
  }

  validateInput(spec: OperationSpec, input: unknown): ValidationFailure[] {
    const validate = this.ajv.compile(spec.inputSchema);
    if (validate(input)) {
      return [];
    }

    return ajvFailures(validate, 'Input is invalid.');
  }
}

function validateRequiredSpecFields(
  spec: Partial<OperationSpec>,
): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  requireString(spec.id, '$.id', failures);
  requireString(spec.version, '$.version', failures);
  requireString(spec.connectionId, '$.connectionId', failures);

  if (spec.request === undefined) {
    failures.push(failure('$.request', 'required', 'Request is required.'));
  }

  return failures;
}

function validateInputPolicy(
  policy: InputPolicy | undefined,
): ValidationFailure[] {
  if (policy === undefined) {
    return [];
  }

  const failures = validatePolicyPaths(policy);
  if (requiresAllowedPaths(policy)) {
    failures.push(
      failure(
        '$.inputPolicy.allowedPaths',
        'required',
        'Allowed paths are required when unknown properties are reduced.',
      ),
    );
  }

  return failures;
}

function validatePolicyPaths(policy: InputPolicy): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  addFailures(
    failures,
    invalidPaths(policy.allowedPaths ?? [], '$.inputPolicy.allowedPaths'),
  );
  addFailures(
    failures,
    invalidPaths(policy.blockedPaths ?? [], '$.inputPolicy.blockedPaths'),
  );
  addFailures(
    failures,
    invalidPaths(
      inputValidatorPaths(policy.validators ?? []),
      '$.inputPolicy.validators',
    ),
  );
  addInvalidRegexes(policy.validators ?? [], failures);
  return failures;
}

function inputValidatorPaths(validators: InputValidator[]): string[] {
  const paths: string[] = [];
  for (const validator of validators) {
    addInputValidatorPaths(validator, paths);
  }

  return paths;
}

function addInputValidatorPaths(rule: InputValidator, paths: string[]): void {
  if ('path' in rule) {
    paths.push(rule.path);
    return;
  }

  if ('paths' in rule) {
    for (const path of rule.paths) {
      paths.push(path);
    }
    return;
  }

  paths.push(rule.whenPath, rule.requiredPath);
}

function addInvalidRegexes(
  validators: InputValidator[],
  failures: ValidationFailure[],
): void {
  for (const validator of validators) {
    if (validator.type === 'matches' && !validRegex(validator.pattern)) {
      failures.push(
        failure(
          '$.inputPolicy.validators',
          'invalid_pattern',
          'Match validators must use a valid regular expression.',
        ),
      );
    }
  }
}

function addFailures(
  failures: ValidationFailure[],
  next: ValidationFailure[],
): void {
  for (const failure of next) {
    failures.push(failure);
  }
}

function validRegex(pattern: string): boolean {
  try {
    new RegExp(pattern, 'u');
    return true;
  } catch {
    return false;
  }
}

function validateRequestFailurePolicy(
  policy: RequestFailurePolicy | undefined,
): ValidationFailure[] {
  if (policy === undefined) {
    return [];
  }

  const failures: ValidationFailure[] = [];
  addRequestFailureModeFailure(policy, failures);
  addRequestFailureCategoryFailures(policy, failures);
  return failures;
}

function addRequestFailureModeFailure(
  policy: RequestFailurePolicy,
  failures: ValidationFailure[],
): void {
  if (!requestFailureModes.has(policy.mode)) {
    failures.push(
      failure(
        '$.requestFailurePolicy.mode',
        'invalid_request_failure_mode',
        'Request failure mode must be fail, defaultResponse, or customResponse.',
      ),
    );
  }
}

function addRequestFailureCategoryFailures(
  policy: RequestFailurePolicy,
  failures: ValidationFailure[],
): void {
  for (const category of policy.categories ?? []) {
    if (!requestFailureCategories.has(category)) {
      failures.push(
        failure(
          '$.requestFailurePolicy.categories',
          'invalid_request_failure_category',
          `Request failure category ${category} is not supported.`,
        ),
      );
    }
  }
}

function requiresAllowedPaths(policy: InputPolicy): boolean {
  const mode = policy.unknownProperties;
  return (
    (mode === 'strip' || mode === 'reject') &&
    (policy.allowedPaths ?? []).length === 0
  );
}

function requireString(
  value: unknown,
  path: string,
  failures: ValidationFailure[],
): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    failures.push(failure(path, 'required', `${path} is required.`));
  }
}

function failure(
  path: string,
  code: string,
  message: string,
): ValidationFailure {
  return { path, code, message };
}
