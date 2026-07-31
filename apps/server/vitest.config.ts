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
      exclude: [
        'src/domain/**/index.ts',
        'src/domain/**/types.ts',
        'src/domain/contracts/application/**',
        'src/domain/contracts/infrastructure/*.repository.ts',
        'src/domain/contracts/infrastructure/transaction-context.ts',
        'src/domain/contracts/infrastructure/unit-of-work.ts',
        'src/domain/contracts/infrastructure/notification-service.ts',
        'src/infrastructure/repositories/types.ts',
      ],
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
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    env: { NODE_ENV: 'test' },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: [
            'src/**/*.test.ts',
            'tests/api/auth/authority-guard.test.ts',
            'tests/api/auth/active-church-pre-validation.test.ts',
            'tests/api/auth/resolve-active-church-and-persist.test.ts',
            'tests/application/db-active-church-resolver.test.ts',
            'tests/application/db-active-church-selection-manager.test.ts',
            'tests/application/db-authority-manager.test.ts',
            'tests/application/db-event-manager.test.ts',
            'tests/application/db-event-template-manager.test.ts',
            'tests/application/db-feature-flag-manager.test.ts',
            'tests/application/db-ministry-invitation-manager.test.ts',
            'tests/contract/**/*.test.ts',
            'tests/domain/**/*.test.ts',
            'tests/dtos/**/*.test.ts',
            'tests/test-support/**/*.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: [
            'tests/application/event-builder.rostering.integration.test.ts',
            'tests/application/planning-phase3.managers.test.ts',
            'tests/application/scheduling-phase4.managers.test.ts',
            'tests/application/scheduling-phase5.volunteer-availability.test.ts',
            'tests/application/scheduling-phase6.rostering.test.ts',
            'tests/application/scheduling-phase7.live-changes.test.ts',
            'tests/behavior/**/*.test.ts',
            'tests/http/**/*.test.ts',
            'tests/integration/**/*.test.ts',
            // These lists are explicit, not globs: a new tests/ directory runs
            // only once it is named here.
            'tests/tenancy/truncation-root.test.ts',
            'tests/tenancy/provision-church.test.ts',
            'tests/tenancy/init-system.test.ts',
            'tests/tenancy/ensure-platform-operator.test.ts',
          ],
        },
      },
    ],
  },
});
