import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    coverage: {
      exclude: ['src/main.ts', 'src/**/*.module.ts', '**/*.spec.ts'],
      include: ['src/**/*.ts'],
      provider: 'istanbul',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      thresholds: {
        branches: 70,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    root: './',
    globals: true,
    include: ['**/*.spec.ts'],
  },
});
