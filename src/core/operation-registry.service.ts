import { Injectable } from '@nestjs/common';
import { type OperationSpec, type ValidationFailure } from './contracts.js';
import { cloneJson } from './path-utils.js';
import { runtimeOperationId } from './response.service.js';
import { ValidationService } from './validation.service.js';

export type RegistryResult<T> =
  { ok: true; value: T } | { ok: false; failures: ValidationFailure[] };

@Injectable()
export class OperationRegistryService {
  private readonly drafts = new Map<string, OperationSpec>();
  private readonly published = new Map<string, OperationSpec>();

  public constructor(private readonly validation: ValidationService) {}

  createDraft(spec: OperationSpec): RegistryResult<OperationSpec> {
    const failures = this.validation.validateSpec(spec);
    if (failures.length > 0) {
      return { ok: false, failures };
    }

    const draft = cloneSpec({ ...spec, status: 'draft' as const });
    this.drafts.set(draft.id, draft);
    return { ok: true, value: cloneSpec(draft) };
  }

  updateDraft(id: string, spec: OperationSpec): RegistryResult<OperationSpec> {
    if (!this.drafts.has(id)) {
      return notFound(id);
    }

    return this.createDraft({ ...spec, id });
  }

  getDraft(id: string): OperationSpec | undefined {
    return cloneSpecOrUndefined(this.drafts.get(id));
  }

  validateDraft(id: string): RegistryResult<OperationSpec> {
    const draft = this.drafts.get(id);
    if (draft === undefined) {
      return notFound(id);
    }

    const failures = this.validation.validateSpec(draft);
    return failures.length > 0
      ? { ok: false, failures }
      : { ok: true, value: cloneSpec(draft) };
  }

  publishDraft(id: string): RegistryResult<OperationSpec> {
    const validated = this.validateDraft(id);
    if (!validated.ok) {
      return validated;
    }

    const published = cloneSpec({
      ...validated.value,
      status: 'published' as const,
    });
    const duplicate = duplicateToolName(this.published, published);
    if (duplicate !== undefined) {
      return duplicateToolFailure(duplicate);
    }

    this.published.set(runtimeOperationId(published), published);
    return { ok: true, value: cloneSpec(published) };
  }

  listPublished(): OperationSpec[] {
    return [...this.published.values()].map(cloneSpec);
  }

  getPublished(operationId: string): OperationSpec | undefined {
    return cloneSpecOrUndefined(this.published.get(operationId));
  }
}

function cloneSpec(spec: OperationSpec): OperationSpec {
  return cloneJson(spec) as OperationSpec;
}

function cloneSpecOrUndefined(
  spec: OperationSpec | undefined,
): OperationSpec | undefined {
  return spec === undefined ? undefined : cloneSpec(spec);
}

function duplicateToolName(
  published: Map<string, OperationSpec>,
  spec: OperationSpec,
): OperationSpec | undefined {
  const toolName = agentToolName(spec);
  return [...published.values()].find(
    (current) =>
      runtimeOperationId(current) !== runtimeOperationId(spec) &&
      agentToolName(current) === toolName,
  );
}

function agentToolName(spec: OperationSpec): string {
  return spec.toolPolicy?.name ?? runtimeOperationId(spec).replaceAll('.', '_');
}

function duplicateToolFailure<T>(duplicate: OperationSpec): RegistryResult<T> {
  return {
    ok: false,
    failures: [
      {
        path: '$.toolPolicy.name',
        code: 'duplicate_tool_name',
        message: `Tool name is already used by ${runtimeOperationId(duplicate)}.`,
      },
    ],
  };
}

function notFound<T>(id: string): RegistryResult<T> {
  return {
    ok: false,
    failures: [
      {
        path: '$.id',
        code: 'not_found',
        message: `Operation ${id} was not found.`,
      },
    ],
  };
}
