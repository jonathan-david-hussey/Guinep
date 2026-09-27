import {
  type InvokeOperationResponse,
  type OperationSpec,
  type SecurityDecision,
  type SecuritySignal,
} from './contracts.js';
import { runtimeOperationId } from './response.service.js';

export function withContextSafety(
  response: InvokeOperationResponse,
  signals: SecuritySignal[],
): InvokeOperationResponse {
  return {
    ...response,
    contextSafety: { trustedAsInstruction: false, source: 'upstream_api' },
    security: { decision: 'allow', signals },
  };
}

export function quarantined(
  spec: OperationSpec,
  signals: SecuritySignal[],
): InvokeOperationResponse {
  return {
    success: false,
    operationId: runtimeOperationId(spec),
    status: 502,
    recoverable: false,
    code: 'response_quarantined',
    message: 'The upstream response was withheld by security policy.',
    contextSafety: { trustedAsInstruction: false, source: 'upstream_api' },
    security: { decision: responseDecisionFor(signals), signals },
  };
}

export function responseDecisionFor(
  signals: SecuritySignal[],
): SecurityDecision {
  return signals.some(
    (signal) => signal.severity === 'block' || signal.category === 'scanner',
  )
    ? 'quarantine'
    : 'allow';
}
