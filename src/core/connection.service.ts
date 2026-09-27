import { Injectable } from '@nestjs/common';
import { type ConnectionSpec } from './contracts.js';
import { cloneJson, isRecord } from './path-utils.js';

@Injectable()
export class ConnectionService {
  private readonly connections = new Map<string, ConnectionSpec>();

  public constructor() {
    for (const connection of parseEnvironmentConnections()) {
      this.connections.set(connection.id, cloneConnection(connection));
    }
  }

  setConnection(connection: ConnectionSpec): void {
    this.connections.set(connection.id, cloneConnection(connection));
  }

  getConnection(id: string): ConnectionSpec | undefined {
    const connection = this.connections.get(id);
    return connection === undefined ? undefined : cloneConnection(connection);
  }
}

function cloneConnection(connection: ConnectionSpec): ConnectionSpec {
  return cloneJson(connection) as ConnectionSpec;
}

function parseEnvironmentConnections(): ConnectionSpec[] {
  const value = process.env['GUINEP_CONNECTIONS'];
  if (value === undefined || value.trim().length === 0) {
    return [];
  }

  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(isConnectionSpec);
}

function isConnectionSpec(value: unknown): value is ConnectionSpec {
  if (!isRecord(value) || !isRecord(value['secrets'])) {
    return false;
  }

  return (
    typeof value['id'] === 'string' && typeof value['baseUrl'] === 'string'
  );
}
