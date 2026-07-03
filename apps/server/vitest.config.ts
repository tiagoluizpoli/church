import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  envDir: resolve(__dirname, '../..'),
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      include: [
        'src/domain/**/*.ts',
        'src/application/**/*.ts',
        'src/infrastructure/repositories/**/*.ts',
        'src/api/dtos/**/*.ts',
      ],
      exclude: ['src/domain/**/index.ts'],
      thresholds: {
        'src/domain/**': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        'src/application/**': {
          statements: 95,
          branches: 90,
          functions: 95,
          lines: 95,
        },
        'src/infrastructure/repositories/**': {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
        'src/api/dtos/**': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    env: { NODE_ENV: 'test' },
  },
});
