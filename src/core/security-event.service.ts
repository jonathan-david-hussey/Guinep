import { Injectable } from '@nestjs/common';
import {
  type ExecutionContext,
  type SecurityDecision,
  type SecuritySignal,
} from './contracts.js';

export interface SecurityEvent {
  operationId: string;
  decision: SecurityDecision;
  source: ExecutionContext['source'];
  runId?: string;
  signals: SecuritySignal[];
}

@Injectable()
export class SecurityEventService {
  private readonly events: SecurityEvent[] = [];

  record(
    operationId: string,
    context: ExecutionContext,
    decision: SecurityDecision,
    signals: SecuritySignal[],
  ): void {
    const event: SecurityEvent = {
      operationId,
      decision,
      source: context.source,
      signals,
    };
    if (context.runId !== undefined) {
      event.runId = context.runId;
    }

    this.events.push(event);
  }

  list(): SecurityEvent[] {
    return [...this.events];
  }
}
