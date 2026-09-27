import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import {
  type ConnectionSpec,
  type OperationSpec,
  type ValidationFailure,
} from './core/contracts.js';
import { ConnectionService } from './core/connection.service.js';
import { OperationRegistryService } from './core/operation-registry.service.js';
import { isRecord } from './core/path-utils.js';

@Injectable()
export class BootstrapConfigService implements OnApplicationBootstrap {
  public constructor(
    private readonly connections: ConnectionService,
    private readonly registry: OperationRegistryService,
  ) {}

  onApplicationBootstrap(): void {
    const config = readBootstrapConfig();
    if (config === undefined) {
      return;
    }

    for (const connection of config.connections) {
      this.connections.setConnection(connection);
    }

    for (const operation of config.operations) {
      publishStartupOperation(this.registry, operation);
    }
  }
}

interface BootstrapConfig {
  connections: ConnectionSpec[];
  operations: OperationSpec[];
}

function readBootstrapConfig(): BootstrapConfig | undefined {
  const rawJson = process.env['GUINEP_CONFIG_JSON'];
  if (rawJson !== undefined && rawJson.trim().length > 0) {
    return parseBootstrapConfig(rawJson, 'GUINEP_CONFIG_JSON');
  }

  const file = process.env['GUINEP_CONFIG_FILE'];
  if (file === undefined || file.trim().length === 0) {
    return undefined;
  }

  return parseBootstrapConfig(
    readFileSync(resolve(file), 'utf8'),
    'GUINEP_CONFIG_FILE',
  );
}

function parseBootstrapConfig(raw: string, source: string): BootstrapConfig {
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`${source} must contain a JSON object.`);
  }

  return {
    connections: arrayOf(parsed['connections'], isConnection),
    operations: arrayOf(parsed['operations'], isOperation),
  };
}

function arrayOf<T>(
  value: unknown,
  predicate: (item: unknown) => item is T,
): T[] {
  return Array.isArray(value) ? value.filter(predicate) : [];
}

function isConnection(value: unknown): value is ConnectionSpec {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['baseUrl'] === 'string' &&
    isRecord(value['secrets'])
  );
}

function isOperation(value: unknown): value is OperationSpec {
  return isRecord(value) && typeof value['id'] === 'string';
}

function publishStartupOperation(
  registry: OperationRegistryService,
  operation: OperationSpec,
): void {
  const draft = registry.createDraft(operation);
  if (!draft.ok) {
    throw startupFailure(operation.id, draft.failures);
  }

  const published = registry.publishDraft(operation.id);
  if (!published.ok) {
    throw startupFailure(operation.id, published.failures);
  }
}

function startupFailure(id: string, failures: ValidationFailure[]): Error {
  return new Error(
    `Startup operation ${id} is invalid: ${JSON.stringify(failures)}`,
  );
}
