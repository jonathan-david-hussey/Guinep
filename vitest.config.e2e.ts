import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    root: './',
    globals: true,
    include: ['**/*.e2e-spec.ts'],
  },
});
