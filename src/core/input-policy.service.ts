import { Injectable } from '@nestjs/common';
import {
  type InputPolicy,
  type InputValidator,
  type JsonObject,
  type OperationSpec,
  type ValidationFailure,
} from './contracts.js';
import {
  cloneJson,
  hasPath,
  isRecord,
  readPath,
  writePath,
} from './path-utils.js';

export type InputPolicyResult =
  | { ok: true; input: JsonObject }
  | { ok: false; failures: ValidationFailure[] };

type InputValidatorHandler = (
  input: JsonObject,
  rule: InputValidator,
) => ValidationFailure | undefined;

const validatorHandlers: Record<InputValidator['type'], InputValidatorHandler> =
  {
    required: (input, rule) =>
      validateRequired(
        input,
        rule as Extract<InputValidator, { type: 'required' }>,
      ),
    requiredAny: (input, rule) =>
      validateRequiredAny(
        input,
        rule as Extract<InputValidator, { type: 'requiredAny' }>,
      ),
    requires: (input, rule) =>
      validateRequires(
        input,
        rule as Extract<InputValidator, { type: 'requires' }>,
      ),
    mutuallyExclusive: (input, rule) =>
      validateMutuallyExclusive(
        input,
        rule as Extract<InputValidator, { type: 'mutuallyExclusive' }>,
      ),
    equals: (input, rule) =>
      validateEquals(
        input,
        rule as Extract<InputValidator, { type: 'equals' }>,
      ),
    notEquals: (input, rule) =>
      validateNotEquals(
        input,
        rule as Extract<InputValidator, { type: 'notEquals' }>,
      ),
    oneOf: (input, rule) =>
      validateOneOf(input, rule as Extract<InputValidator, { type: 'oneOf' }>),
    matches: (input, rule) =>
      validateMatches(
        input,
        rule as Extract<InputValidator, { type: 'matches' }>,
      ),
    length: (input, rule) =>
      validateLength(
        input,
        rule as Extract<InputValidator, { type: 'length' }>,
      ),
    range: (input, rule) =>
      validateRange(input, rule as Extract<InputValidator, { type: 'range' }>),
  };

@Injectable()
export class InputPolicyService {
  prepareInput(spec: OperationSpec, input: JsonObject): InputPolicyResult {
    const policy = spec.inputPolicy;
    const reduced = reduceUnknownProperties(input, policy);
    const failures: ValidationFailure[] = [];
    addUnknownFailures(input, policy, failures);
    addBlockedFailures(input, policy, failures);
    addValidatorFailures(reduced, policy, failures);

    return failures.length > 0
      ? { ok: false, failures }
      : { ok: true, input: reduced };
  }
}

function reduceUnknownProperties(
  input: JsonObject,
  policy: InputPolicy | undefined,
): JsonObject {
  if (policy?.unknownProperties !== 'strip') {
    return cloneInput(input);
  }

  return copyAllowedPaths(input, policy.allowedPaths ?? []);
}

function cloneInput(input: JsonObject): JsonObject {
  return cloneJson(input) as JsonObject;
}

function copyAllowedPaths(input: JsonObject, paths: string[]): JsonObject {
  const result: JsonObject = {};
  for (const path of paths) {
    if (hasPath(input, path)) {
      writePath(result, path, readPath(input, path));
    }
  }

  return result;
}

function addUnknownFailures(
  input: JsonObject,
  policy: InputPolicy | undefined,
  failures: ValidationFailure[],
): void {
  if (policy?.unknownProperties !== 'reject') {
    return;
  }

  addUnknownLeafFailures(input, '$', policy.allowedPaths ?? [], failures);
}

function addUnknownLeafFailures(
  value: unknown,
  path: string,
  allowedPaths: string[],
  failures: ValidationFailure[],
): void {
  if (!isRecord(value)) {
    if (!isAllowed(path, allowedPaths)) {
      failures.push({
        path,
        code: 'unknown_property',
        message: `Input path ${path} is not allowed.`,
      });
    }
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    addUnknownLeafFailures(child, `${path}.${key}`, allowedPaths, failures);
  }
}

function isAllowed(path: string, allowedPaths: string[]): boolean {
  return allowedPaths.some((allowedPath) => pathIsAllowed(path, allowedPath));
}

function pathIsAllowed(path: string, allowedPath: string): boolean {
  return path === allowedPath || path.startsWith(`${allowedPath}.`);
}

function addBlockedFailures(
  input: JsonObject,
  policy: InputPolicy | undefined,
  failures: ValidationFailure[],
): void {
  for (const path of policy?.blockedPaths ?? []) {
    if (hasPath(input, path)) {
      failures.push({
        path,
        code: 'blocked_input',
        message: `Input path ${path} cannot be supplied by the caller.`,
      });
    }
  }
}

function addValidatorFailures(
  input: JsonObject,
  policy: InputPolicy | undefined,
  failures: ValidationFailure[],
): void {
  for (const rule of policy?.validators ?? []) {
    const failure = validateRule(input, rule);
    if (failure !== undefined) {
      failures.push(failure);
    }
  }
}

function validateRule(
  input: JsonObject,
  rule: InputValidator,
): ValidationFailure | undefined {
  return validatorHandlers[rule.type](input, rule);
}

function validateRequired(
  input: JsonObject,
  rule: Extract<InputValidator, { type: 'required' }>,
): ValidationFailure | undefined {
  return hasPath(input, rule.path) ? undefined : validatorFailure(rule);
}

function validateRequiredAny(
  input: JsonObject,
  rule: Extract<InputValidator, { type: 'requiredAny' }>,
): ValidationFailure | undefined {
  for (const path of rule.paths) {
    if (hasPath(input, path)) {
      return undefined;
    }
  }

  return validatorFailure(rule);
}

function validateRequires(
  input: JsonObject,
  rule: Extract<InputValidator, { type: 'requires' }>,
): ValidationFailure | undefined {
  if (readPath(input, rule.whenPath) !== rule.whenEquals) {
    return undefined;
  }

  return hasPath(input, rule.requiredPath) ? undefined : validatorFailure(rule);
}

function validateMutuallyExclusive(
  input: JsonObject,
  rule: Extract<InputValidator, { type: 'mutuallyExclusive' }>,
): ValidationFailure | undefined {
  let present = 0;
  for (const path of rule.paths) {
    if (hasPath(input, path)) {
      present += 1;
    }

    if (present > 1) {
      return validatorFailure(rule);
    }
  }

  return undefined;
}

function validateEquals(
  input: JsonObject,
  rule: Extract<InputValidator, { type: 'equals' | 'notEquals' }>,
): ValidationFailure | undefined {
  return readPath(input, rule.path) === rule.value
    ? undefined
    : validatorFailure(rule);
}

function validateNotEquals(
  input: JsonObject,
  rule: Extract<InputValidator, { type: 'equals' | 'notEquals' }>,
): ValidationFailure | undefined {
  return readPath(input, rule.path) !== rule.value
    ? undefined
    : validatorFailure(rule);
}

function validateOneOf(
  input: JsonObject,
  rule: Extract<InputValidator, { type: 'oneOf' }>,
): ValidationFailure | undefined {
  const value = readPath(input, rule.path);
  for (const allowed of rule.values) {
    if (allowed === value) {
      return undefined;
    }
  }

  return validatorFailure(rule);
}

function validateMatches(
  input: JsonObject,
  rule: Extract<InputValidator, { type: 'matches' }>,
): ValidationFailure | undefined {
  const value = readPath(input, rule.path);
  return typeof value === 'string' && new RegExp(rule.pattern, 'u').test(value)
    ? undefined
    : validatorFailure(rule);
}

function validateLength(
  input: JsonObject,
  rule: Extract<InputValidator, { type: 'length' }>,
): ValidationFailure | undefined {
  const value = readPath(input, rule.path);
  const length =
    typeof value === 'string' || Array.isArray(value)
      ? value.length
      : undefined;
  return length !== undefined && withinRange(length, rule.min, rule.max)
    ? undefined
    : validatorFailure(rule);
}

function validateRange(
  input: JsonObject,
  rule: Extract<InputValidator, { type: 'range' }>,
): ValidationFailure | undefined {
  const value = readPath(input, rule.path);
  return typeof value === 'number' && withinRange(value, rule.min, rule.max)
    ? undefined
    : validatorFailure(rule);
}

function withinRange(
  value: number,
  min: number | undefined,
  max: number | undefined,
): boolean {
  return (
    (min === undefined || value >= min) && (max === undefined || value <= max)
  );
}

function validatorFailure(rule: InputValidator): ValidationFailure {
  return { path: '$', code: rule.code, message: rule.message };
}
