import {
  executionSources,
  type ApprovalPolicy,
  type ExecutionPolicy,
  type ValidationFailure,
} from './contracts.js';

export function validateExecutionPolicy(
  policy: ExecutionPolicy | undefined,
): ValidationFailure[] {
  if (policy === undefined) {
    return [];
  }

  return [
    ...invalidSources(policy.allowedSources ?? []),
    ...invalidPaths(
      policy.requiredGroundingPaths ?? [],
      '$.executionPolicy.requiredGroundingPaths',
    ),
    ...invalidApprovalMode(policy.approval),
    ...invalidBudgets(policy.budgets),
  ];
}

export function invalidPaths(
  paths: string[],
  basePath: string,
): ValidationFailure[] {
  return paths
    .filter((path) => !path.startsWith('$.'))
    .map((path) =>
      failure(basePath, 'invalid_path', `Path ${path} must start with $.`),
    );
}

function invalidApprovalMode(
  approval: ApprovalPolicy | undefined,
): ValidationFailure[] {
  if (approval === undefined || approvalModes().has(approval.mode)) {
    return [];
  }

  return [
    failure(
      '$.executionPolicy.approval.mode',
      'invalid_approval_mode',
      'Approval mode must be never, always, or ruleOfTwo.',
    ),
  ];
}

function approvalModes(): Set<string> {
  return new Set(['never', 'always', 'ruleOfTwo']);
}

function invalidSources(sources: string[]): ValidationFailure[] {
  return sources
    .filter((source) => !isExecutionSource(source))
    .map((source) =>
      failure(
        '$.executionPolicy.allowedSources',
        'invalid_source',
        `Execution source ${source} is not supported.`,
      ),
    );
}

function isExecutionSource(source: string): boolean {
  return executionSources.some((allowedSource) => allowedSource === source);
}

function invalidBudgets(
  budgets: ExecutionPolicy['budgets'],
): ValidationFailure[] {
  return Object.entries(budgets ?? {})
    .filter(([, value]) => !validBudgetValue(value))
    .map(([key]) =>
      failure(
        `$.executionPolicy.budgets.${key}`,
        'invalid_budget',
        'Budget values must be positive integers.',
      ),
    );
}

function validBudgetValue(value: unknown): boolean {
  return Number.isInteger(value) && Number(value) > 0;
}

function failure(
  path: string,
  code: string,
  message: string,
): ValidationFailure {
  return { path, code, message };
}
