export type RuntimeMode = 'development' | 'production' | 'test';

const runtimeModes = new Set<RuntimeMode>([
  'development',
  'production',
  'test',
]);

export function resolveRuntimeMode(value: string | undefined): RuntimeMode {
  if (value === undefined) {
    return 'development';
  }

  const normalizedValue = value.trim().toLowerCase();

  if (runtimeModes.has(normalizedValue as RuntimeMode)) {
    return normalizedValue as RuntimeMode;
  }

  return 'development';
}
