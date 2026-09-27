import {
  type InvokeOperationResponse,
  type OperationSpec,
} from './contracts.js';
import { type HttpExecutorService } from './http-executor.service.js';
import { type ResponseService } from './response.service.js';

export function shapeRuntimeResponse(
  responses: ResponseService,
  spec: OperationSpec,
  result: Awaited<ReturnType<HttpExecutorService['execute']>>,
): InvokeOperationResponse {
  return result.ok
    ? responses.shapeSuccess(spec, result)
    : responses.shapeFailure(spec, result);
}
