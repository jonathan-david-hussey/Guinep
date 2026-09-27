import { Injectable } from '@nestjs/common';
import { resolveRuntimeMode } from './core/runtime-mode.js';

@Injectable()
export class ApiKeyService {
  readonly adminKey: string;
  readonly invokeKey: string;

  public constructor() {
    const mode = resolveRuntimeMode(process.env['NODE_ENV']);
    this.adminKey =
      process.env['GUINEP_ADMIN_KEY'] ?? testKey(mode, 'admin-test-key');
    this.invokeKey =
      process.env['GUINEP_API_KEY'] ?? testKey(mode, 'invoke-test-key');
  }
}

function testKey(mode: string, value: string): string {
  if (mode === 'test') {
    return value;
  }

  throw new Error('GUINEP_ADMIN_KEY and GUINEP_API_KEY are required.');
}
