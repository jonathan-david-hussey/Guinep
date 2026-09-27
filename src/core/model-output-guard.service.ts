import { Ajv } from 'ajv/dist/ajv.js';
import { Injectable } from '@nestjs/common';
import {
  type JsonSchema,
  type SecuritySignal,
  type ValidationFailure,
} from './contracts.js';
import { scanTextContent } from './security-scanner.js';
import { ajvFailures } from './ajv-utils.js';

export type ModelOutputGuardResult =
  | { ok: true; output: unknown; signals: SecuritySignal[] }
  | { ok: false; failures: ValidationFailure[]; signals: SecuritySignal[] };

@Injectable()
export class ModelOutputGuardService {
  private readonly ajv = new Ajv({ allErrors: true, strict: false });

  validate(output: unknown, schema: JsonSchema): ModelOutputGuardResult {
    const signals = scanTextContent(output, {
      textTooLargeCode: 'model_output_text_limit_exceeded',
    });
    const validate = this.ajv.compile(schema);
    const schemaFailures = validate(output)
      ? []
      : ajvFailures(validate, 'Model output is invalid.');
    const scannerFailures = scannerValidationFailures(signals);
    const failures = [...schemaFailures, ...scannerFailures];
    return failures.length === 0
      ? { ok: true, output, signals }
      : { ok: false, failures, signals };
  }
}

function scannerValidationFailures(
  signals: SecuritySignal[],
): ValidationFailure[] {
  return signals.map((signal) => ({
    path: signal.path ?? '$',
    code: signal.code,
    message: signal.message,
  }));
}
