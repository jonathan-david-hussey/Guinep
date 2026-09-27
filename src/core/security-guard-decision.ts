import {
  type ApprovalPreview,
  type SecurityDecision,
  type SecuritySignal,
  type ValidationFailure,
} from './contracts.js';

export function decisionFor(signals: SecuritySignal[]): SecurityDecision {
  if (signals.some((signal) => signal.category === 'approval')) {
    return 'require_approval';
  }

  if (signals.some((signal) => signal.category === 'scanner')) {
    return 'block';
  }

  return signals.some((signal) => signal.severity === 'block')
    ? 'block'
    : 'allow';
}

export function failuresFor(
  signals: SecuritySignal[],
  approvalPreview?: ApprovalPreview,
): ValidationFailure[] {
  return signals.map((signal) => {
    const failure = {
      path: signal.path ?? '$',
      code: signal.code,
      message: signal.message,
    };

    return signal.category === 'approval' && approvalPreview !== undefined
      ? { ...failure, details: approvalPreview }
      : failure;
  });
}
