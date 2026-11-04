import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@\//,
        replacement: `${import.meta.dirname}/src/`,
      },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/setup/per-run-database.global.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    env: { NODE_ENV: 'test' },
  },
});
