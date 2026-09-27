import {
  type OperationSpec,
  type SecuritySignal,
  type ToolPolicy,
  type ValidationFailure,
} from './contracts.js';
import { scanTextContent } from './security-scanner.js';
import { invalidPaths } from './validation-execution.js';
export { validateToolProvenance } from './validation-tool-provenance.js';

export function validateToolPolicy(
  policy: ToolPolicy | undefined,
): ValidationFailure[] {
  return [
    ...invalidToolName(policy?.name),
    ...invalidPaths(
      policy?.hiddenInputPaths ?? [],
      '$.toolPolicy.hiddenInputPaths',
    ),
  ];
}

export function validateToolMetadata(
  spec: Partial<OperationSpec>,
): ValidationFailure[] {
  return scanTextContent(toolMetadata(spec), {
    maxTextLength: 4_000,
    textTooLargeCode: 'tool_metadata_too_large',
  }).map(toolMetadataFailure);
}

function invalidToolName(name: string | undefined): ValidationFailure[] {
  if (name === undefined || /^[A-Za-z_][A-Za-z0-9_]{0,63}$/u.test(name)) {
    return [];
  }

  return [
    failure(
      '$.toolPolicy.name',
      'invalid_tool_name',
      'Tool name must start with a letter or underscore and contain only letters, numbers, and underscores.',
    ),
  ];
}

function toolMetadata(spec: Partial<OperationSpec>): unknown {
  return {
    id: spec.id,
    displayName: spec.displayName,
    toolPolicy: {
      name: spec.toolPolicy?.name,
      description: spec.toolPolicy?.description,
    },
  };
}

function toolMetadataFailure(signal: SecuritySignal): ValidationFailure {
  return failure(
    signal.path ?? '$.toolPolicy',
    'unsafe_tool_metadata',
    `Tool metadata is not safe for agent exposure: ${signal.message}`,
  );
}

function failure(
  path: string,
  code: string,
  message: string,
): ValidationFailure {
  return { path, code, message };
}
