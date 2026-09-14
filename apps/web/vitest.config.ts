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
 *
 * Ambient timezone: pinned to a far-from-UTC zone (unless `TZ` is already
 * set) before any worker starts, so tests that render in a Church Timezone
 * prove it on every machine and in CI instead of passing by coincidence on a
 * UTC runner. Set `TZ` explicitly to check the suite under another zone.
 */
process.env.TZ ||= 'Pacific/Auckland';

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
          testTimeout: 20000,
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
