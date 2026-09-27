import { Injectable } from '@nestjs/common';
import {
  type SystemPromptPolicy,
  type SystemPromptResponse,
} from './contracts.js';
import { stripInvisibleCharacters } from './security-scanner.js';

@Injectable()
export class SystemPromptPolicyService {
  build(policy: SystemPromptPolicy): SystemPromptResponse {
    return {
      trustedAsInstruction: true,
      content: linesFor(policy).join('\n'),
    };
  }
}

function linesFor(policy: SystemPromptPolicy): string[] {
  return [
    `Role: ${clean(policy.role)}`,
    ...policy.allow.map((value) => `Allow: ${clean(value)}`),
    ...policy.deny.map((value) => `Deny: ${clean(value)}`),
    ...policy.capabilities.map((value) => `Capability: ${clean(value)}`),
    `External content label: ${clean(policy.externalContentLabel ?? 'untrusted data')}`,
  ];
}

function clean(value: string): string {
  return String(stripInvisibleCharacters(value)).trim();
}
