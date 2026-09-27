import { Injectable } from '@nestjs/common';
import { type MappedHttpRequest } from './contracts.js';
import {
  redactHeaders,
  redactQuery,
  redactSecretLikeKeys,
  redactValue,
} from './redaction.js';

export interface AuditEntry {
  operationId: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

@Injectable()
export class AuditLogService {
  private readonly entries: AuditEntry[] = [];

  recordRequest(
    operationId: string,
    request: MappedHttpRequest,
    redactedHeaders: string[],
    redactedQuery: string[],
    redactedBodyPaths: string[],
  ): void {
    this.entries.push({
      operationId,
      method: request.method,
      url: redactQuery(request.url, redactedQuery).toString(),
      headers: redactHeaders(request.headers, redactedHeaders),
      body: redactSecretLikeKeys(redactValue(request.body, redactedBodyPaths)),
    });
  }

  list(): AuditEntry[] {
    return [...this.entries];
  }
}
