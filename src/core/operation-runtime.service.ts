import { Injectable } from '@nestjs/common';
import {
  type ExecutionContext,
  type InvokeOperationResponse,
  type JsonObject,
  type MappedHttpRequest,
  type OperationSpec,
  type RequestFailureCategory,
  type RequestFailurePolicy,
  type ValidationFailure,
} from './contracts.js';
import { AuditLogService } from './audit-log.service.js';
import { AuthService } from './auth.service.js';
import { ConnectionService } from './connection.service.js';
import { HttpExecutorService } from './http-executor.service.js';
import { InputPolicyService } from './input-policy.service.js';
import { MappingService } from './mapping.service.js';
import { OperationRegistryService } from './operation-registry.service.js';
import { ResponseService, runtimeOperationId } from './response.service.js';
import {
  defaultContext,
  missingConnection,
  unpublished,
} from './runtime-context.js';
import { shapeRuntimeResponse } from './runtime-response.js';
import { SecurityGuardService } from './security-guard.service.js';
import { SecurityService } from './security.service.js';
import { ValidationService } from './validation.service.js';

export type InvokeResult =
  | { ok: true; value: InvokeOperationResponse }
  | { ok: false; failures: ValidationFailure[] };

type PreparedRequestResult =
  | { ok: true; value: PreparedRequest }
  | {
      ok: false;
      failures: ValidationFailure[];
      category: RequestFailureCategory;
    };

interface PreparedRequest {
  request: MappedHttpRequest;
  redactedHeaders: string[];
  redactedQuery: string[];
}

@Injectable()
export class OperationRuntimeService {
  public constructor(
    private readonly registry: OperationRegistryService,
    private readonly connections: ConnectionService,
    private readonly inputPolicy: InputPolicyService,
    private readonly validation: ValidationService,
    private readonly mapper: MappingService,
    private readonly auth: AuthService,
    private readonly security: SecurityService,
    private readonly guard: SecurityGuardService,
    private readonly executor: HttpExecutorService,
    private readonly responses: ResponseService,
    private readonly audit: AuditLogService,
  ) {}

  async testDraft(
    id: string,
    input: JsonObject,
    context: ExecutionContext = defaultContext('api'),
  ): Promise<InvokeResult> {
    const draft = this.registry.validateDraft(id);
    return draft.ok ? this.invokeSpec(draft.value, input, context) : draft;
  }

  async invokePublished(
    operationId: string,
    input: JsonObject,
    context: ExecutionContext = defaultContext('api'),
  ): Promise<InvokeResult> {
    const spec = this.registry.getPublished(operationId);
    if (spec === undefined) {
      return unpublished(operationId);
    }

    return this.invokeSpec(spec, input, context);
  }

  private async invokeSpec(
    spec: OperationSpec,
    input: JsonObject,
    context: ExecutionContext,
  ): Promise<InvokeResult> {
    const prepared = this.prepareRequest(spec, input, context);
    if (!prepared.ok) {
      return requestFailureResult(spec, prepared);
    }

    this.audit.recordRequest(
      spec.id,
      prepared.value.request,
      prepared.value.redactedHeaders,
      prepared.value.redactedQuery,
      spec.securityPolicy.redactedRequestPaths,
    );

    const result = await this.executor.execute(
      prepared.value.request,
      spec.retryPolicy,
    );
    return {
      ok: true,
      value: this.guard.afterResponse(
        spec,
        shapeRuntimeResponse(this.responses, spec, result),
        context,
      ),
    };
  }

  private prepareRequest(
    spec: OperationSpec,
    input: JsonObject,
    context: ExecutionContext,
  ): PreparedRequestResult {
    const preparedInput = this.inputPolicy.prepareInput(spec, input);
    if (!preparedInput.ok) {
      return categorizedFailure(preparedInput.failures, 'input_policy');
    }

    const security = this.guard.beforeInvoke(
      spec,
      preparedInput.input,
      context,
    );
    if (!security.ok) {
      return categorizedFailure(security.failures, 'security');
    }

    const inputFailures = this.validation.validateInput(
      spec,
      preparedInput.input,
    );
    if (inputFailures.length > 0) {
      return categorizedFailure(inputFailures, 'input_schema');
    }

    return this.mapAndSecure(spec, preparedInput.input, context);
  }

  private mapAndSecure(
    spec: OperationSpec,
    input: JsonObject,
    context: ExecutionContext,
  ): PreparedRequestResult {
    const connection = this.connections.getConnection(spec.connectionId);
    if (connection === undefined) {
      return categorizedFailure(
        missingConnectionFailure(spec.connectionId),
        'connection',
      );
    }

    const mapped = this.mapper.mapRequest(spec, input, connection);
    if (!mapped.ok) {
      return categorizedFailure(mapped.failures, 'mapping');
    }

    return this.applyAuthAndSecurity(spec, connection, mapped.request, context);
  }

  private applyAuthAndSecurity(
    spec: OperationSpec,
    connection: NonNullable<ReturnType<ConnectionService['getConnection']>>,
    request: MappedHttpRequest,
    context: ExecutionContext,
  ): PreparedRequestResult {
    const authorized = this.auth.applyAuth(
      request,
      spec.authPolicy,
      connection,
    );
    if (!authorized.ok) {
      return categorizedFailure(authorized.failures, 'auth');
    }

    const failures = this.security.validateRequest(spec, authorized.request);
    if (failures.length > 0) {
      return categorizedFailure(failures, 'security');
    }

    const dispatch = this.guard.beforeDispatch(
      spec,
      authorized.request,
      context,
      authorized.redactedHeaders,
      authorized.redactedQuery,
    );
    return dispatch.ok
      ? { ok: true, value: authorized }
      : categorizedFailure(dispatch.failures, 'security');
  }
}

export { defaultContext } from './runtime-context.js';

function requestFailureResult(
  spec: OperationSpec,
  result: Extract<PreparedRequestResult, { ok: false }>,
): InvokeResult {
  const policy = activeRequestFailurePolicy(spec, result.category);
  if (policy === undefined || policy.mode === 'fail') {
    return { ok: false, failures: result.failures };
  }

  return { ok: true, value: failureResponse(spec, result, policy) };
}

function activeRequestFailurePolicy(
  spec: OperationSpec,
  category: RequestFailureCategory,
): RequestFailurePolicy | undefined {
  const policy = spec.requestFailurePolicy;
  if (policy === undefined) {
    return undefined;
  }

  return policy.categories === undefined || policy.categories.includes(category)
    ? policy
    : undefined;
}

function failureResponse(
  spec: OperationSpec,
  result: Extract<PreparedRequestResult, { ok: false }>,
  policy: RequestFailurePolicy,
): InvokeOperationResponse {
  const response = baseFailureResponse(
    spec,
    result,
    configuredFailureResponse(policy),
  );
  return withFailureDetails(response, result, policy);
}

function baseFailureResponse(
  spec: OperationSpec,
  result: Extract<PreparedRequestResult, { ok: false }>,
  configured: RequestFailurePolicy['response'] | RequestFailurePolicy,
): InvokeOperationResponse {
  return {
    success: false,
    operationId: runtimeOperationId(spec),
    status: failureStatus(configured),
    recoverable: failureRecoverable(configured),
    code: failureCode(configured, result),
    message: failureMessage(configured),
  };
}

function failureStatus(
  configured: RequestFailurePolicy['response'] | RequestFailurePolicy,
): number {
  return configured?.status ?? 200;
}

function failureRecoverable(
  configured: RequestFailurePolicy['response'] | RequestFailurePolicy,
): boolean {
  return configured?.recoverable ?? false;
}

function failureCode(
  configured: RequestFailurePolicy['response'] | RequestFailurePolicy,
  result: Extract<PreparedRequestResult, { ok: false }>,
): string {
  return configured?.code ?? firstFailure(result).code;
}

function failureMessage(
  configured: RequestFailurePolicy['response'] | RequestFailurePolicy,
): string {
  return configured?.message ?? 'Request rejected before dispatch.';
}

function configuredFailureResponse(
  policy: RequestFailurePolicy,
): RequestFailurePolicy['response'] | RequestFailurePolicy {
  return policy.mode === 'customResponse' ? policy.response : policy;
}

function withFailureDetails(
  response: InvokeOperationResponse,
  result: Extract<PreparedRequestResult, { ok: false }>,
  policy: RequestFailurePolicy,
): InvokeOperationResponse {
  return policy.includeFailures === true
    ? { ...response, data: { failures: result.failures } }
    : withConfiguredData(response, configuredFailureResponse(policy));
}

function withConfiguredData(
  response: InvokeOperationResponse,
  configured: RequestFailurePolicy['response'] | RequestFailurePolicy,
): InvokeOperationResponse {
  return configured?.data === undefined
    ? response
    : { ...response, data: configured.data };
}

function firstFailure(
  result: Extract<PreparedRequestResult, { ok: false }>,
): ValidationFailure {
  const failure = result.failures[0];
  if (failure === undefined) {
    throw new Error('Expected at least one request failure.');
  }

  return failure;
}

function categorizedFailure(
  failures: ValidationFailure[],
  category: RequestFailureCategory,
): Extract<PreparedRequestResult, { ok: false }> {
  return { ok: false, failures, category };
}

function missingConnectionFailure(connectionId: string): ValidationFailure[] {
  const result = missingConnection<PreparedRequest>(connectionId);
  return result.ok ? [] : result.failures;
}
