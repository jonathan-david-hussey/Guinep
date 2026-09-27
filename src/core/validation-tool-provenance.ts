import {
  type ExecutionPolicy,
  type ToolPolicy,
  type ValidationFailure,
} from './contracts.js';
import { isRecord } from './path-utils.js';

export function validateToolProvenance(
  policy: ToolPolicy | undefined,
  executionPolicy: ExecutionPolicy | undefined,
): ValidationFailure[] {
  const provenance = (policy as { provenance?: unknown } | undefined)
    ?.provenance;
  if (requiresMcpProvenance(executionPolicy) && !isRecord(provenance)) {
    return [
      failure(
        '$.toolPolicy.provenance',
        'trusted_tool_provenance_required',
        'MCP-exposed tools require pinned, signed provenance.',
      ),
    ];
  }

  if (provenance === undefined) {
    return [];
  }

  if (!isRecord(provenance)) {
    return [
      failure(
        '$.toolPolicy.provenance',
        'invalid_tool_provenance',
        'Tool provenance must be an object.',
      ),
    ];
  }

  return [
    ...invalidMcpProvenanceSource(provenance, executionPolicy),
    ...invalidProvenanceSource(provenance),
    ...missingProvenanceStrings(provenance),
    ...unpinnedVersion(provenance),
    ...invalidSha256(provenance['sha256'], '$.toolPolicy.provenance.sha256'),
    ...invalidSha256(
      provenance['descriptionAuditSha256'],
      '$.toolPolicy.provenance.descriptionAuditSha256',
    ),
    ...missingMcpSignature(provenance),
  ];
}

function invalidMcpProvenanceSource(
  provenance: Record<string, unknown>,
  executionPolicy: ExecutionPolicy | undefined,
): ValidationFailure[] {
  if (
    !requiresMcpProvenance(executionPolicy) ||
    provenance['source'] === 'mcp'
  ) {
    return [];
  }

  return [
    failure(
      '$.toolPolicy.provenance.source',
      'trusted_tool_provenance_source_required',
      'MCP-exposed tools require MCP provenance.',
    ),
  ];
}

function requiresMcpProvenance(
  executionPolicy: ExecutionPolicy | undefined,
): boolean {
  return (executionPolicy?.allowedSources ?? []).includes('mcp');
}

function invalidProvenanceSource(
  provenance: Record<string, unknown>,
): ValidationFailure[] {
  const source = provenance['source'];
  if (
    source === 'local' ||
    source === 'mcp' ||
    source === 'plugin' ||
    source === 'workflow'
  ) {
    return [];
  }

  return [
    failure(
      '$.toolPolicy.provenance.source',
      'invalid_tool_provenance_source',
      'Tool provenance source must be local, mcp, plugin, or workflow.',
    ),
  ];
}

function missingProvenanceStrings(
  provenance: Record<string, unknown>,
): ValidationFailure[] {
  return ['packageName', 'version', 'sha256']
    .filter((key) => !isNonEmptyString(provenance[key]))
    .map((key) =>
      failure(
        `$.toolPolicy.provenance.${key}`,
        'invalid_tool_provenance',
        'Tool provenance requires packageName, version, and sha256.',
      ),
    );
}

function unpinnedVersion(
  provenance: Record<string, unknown>,
): ValidationFailure[] {
  const version = provenance['version'];
  return typeof version === 'string' && /[\s*<>=|^~]/u.test(version)
    ? [
        failure(
          '$.toolPolicy.provenance.version',
          'unpinned_tool_version',
          'Tool provenance version must be an exact pinned version.',
        ),
      ]
    : [];
}

function invalidSha256(value: unknown, path: string): ValidationFailure[] {
  if (value === undefined || isSha256(value)) {
    return [];
  }

  return [
    failure(path, 'invalid_tool_digest', 'Tool digest must be a SHA-256 hex.'),
  ];
}

function missingMcpSignature(
  provenance: Record<string, unknown>,
): ValidationFailure[] {
  if (
    provenance['source'] !== 'mcp' ||
    isNonEmptyString(provenance['signature'])
  ) {
    return [];
  }

  return [
    failure(
      '$.toolPolicy.provenance.signature',
      'trusted_tool_signature_required',
      'MCP tool provenance requires a signature.',
    ),
  ];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSha256(value: unknown): boolean {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function failure(
  path: string,
  code: string,
  message: string,
): ValidationFailure {
  return { path, code, message };
}
