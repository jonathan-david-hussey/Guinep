import { Injectable } from '@nestjs/common';
import {
  type InvokeOperationResponse,
  type OperationSpec,
  type UpstreamResult,
} from './contracts.js';
import {
  defaultErrorCode,
  defaultErrorMessage,
  matchingErrorRule,
  responseStatus,
} from './error-policy.js';
import { redactSecretLikeKeys, redactValue } from './redaction.js';
import { applyResponseTransform } from './response-transform.js';

@Injectable()
export class ResponseService {
  shapeSuccess(
    spec: OperationSpec,
    result: Extract<UpstreamResult, { ok: true }>,
  ): InvokeOperationResponse {
    return {
      success: true,
      operationId: runtimeOperationId(spec),
      status: 200,
      providerStatus: result.status,
      data: redactSecretLikeKeys(
        redactValue(
          applyResponseTransform(result.body, spec.responsePolicy.success),
          spec.securityPolicy.redactedResponsePaths,
        ),
      ),
    };
  }

  shapeFailure(
    spec: OperationSpec,
    result: Exclude<UpstreamResult, { ok: true }>,
  ): InvokeOperationResponse {
    const rule = matchingErrorRule(spec, result);
    const response: InvokeOperationResponse = {
      success: false,
      operationId: runtimeOperationId(spec),
      status: responseStatus(rule),
      recoverable: rule?.recoverable ?? false,
      code: rule?.code ?? defaultErrorCode(result),
      message: rule?.message ?? defaultErrorMessage(result),
    };

    if (result.status !== undefined) {
      response.providerStatus = result.status;
    }

    return response;
  }
}

export function runtimeOperationId(spec: OperationSpec): string {
  return `${spec.id}.${spec.version}`;
}
