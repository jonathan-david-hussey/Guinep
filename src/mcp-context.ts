import { type ExecutionContext } from './core/contracts.js';

export function mcpContext(): ExecutionContext {
  return {
    source: 'mcp',
    capabilities: configuredMcpCapabilities(),
  };
}

function configuredMcpCapabilities(): string[] {
  return (process.env['GUINEP_MCP_CAPABILITIES'] ?? '')
    .split(',')
    .map((capability) => capability.trim())
    .filter((capability) => capability.length > 0);
}
