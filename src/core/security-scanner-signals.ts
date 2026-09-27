import { type SecuritySignal } from './contracts.js';
import { scannerMessage } from './security-scanner-messages.js';

export function scannerBlockSignal(
  code: string,
  category: SecuritySignal['category'],
  path: string,
): SecuritySignal {
  return {
    code,
    category,
    path,
    severity: 'block',
    message: scannerMessage(code),
  };
}

export function scannerWarningSignal(
  code: string,
  path: string,
): SecuritySignal {
  return {
    code,
    path,
    severity: 'warning',
    category: 'scanner',
    message: scannerMessage(code),
  };
}
