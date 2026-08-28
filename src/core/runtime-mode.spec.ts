import { resolveRuntimeMode } from './runtime-mode.js';

describe('resolveRuntimeMode', () => {
  it.each([
    ['development', 'development'],
    ['production', 'production'],
    ['test', 'test'],
    [' PRODUCTION ', 'production'],
  ] as const)('resolves %s as %s', (value, expectedMode) => {
    expect(resolveRuntimeMode(value)).toBe(expectedMode);
  });

  it('defaults to development when no value is provided', () => {
    expect(resolveRuntimeMode(undefined)).toBe('development');
  });

  it('defaults to development for unknown values', () => {
    expect(resolveRuntimeMode('staging')).toBe('development');
  });
});
