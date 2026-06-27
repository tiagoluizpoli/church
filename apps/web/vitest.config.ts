import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Web test config (T125). Three projects share root `plugins`/`resolve`
 * (via `extends: true`):
 *   - unit:        node env, pure logic     — `*.unit.test.ts`
 *   - component:   jsdom env + RTL + MSW     — `*.component.test.{ts,tsx}`
 *   - integration: node env, real services   — `*.integration.test.ts`
 *
 * `envDir` points at this package so `apps/web/.env` (VITE_SERVER_URL) loads,
 * which `@church/env/web` validates at import time.
 */
export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(__dirname),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.unit.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'component',
          environment: 'jsdom',
          include: ['src/**/*.component.test.{ts,tsx}'],
          setupFiles: ['./src/__tests__/setup/component.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['src/**/*.integration.test.ts'],
        },
      },
    ],
  },
});
