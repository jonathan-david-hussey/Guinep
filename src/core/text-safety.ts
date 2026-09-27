import { type SecurityDecision, type SecuritySignal } from './contracts.js';
export { redactSecretLikeKeys } from './redaction.js';

export function securityDecisionFor(
  signals: SecuritySignal[],
  quarantineOnScannerSignals: boolean,
): SecurityDecision {
  if (signals.some((signal) => signal.severity === 'block')) {
    return 'block';
  }

  return quarantineOnScannerSignals && hasScannerSignal(signals)
    ? 'quarantine'
    : 'allow';
}

export function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
}

function hasScannerSignal(signals: SecuritySignal[]): boolean {
  return signals.some((signal) => signal.category === 'scanner');
}
