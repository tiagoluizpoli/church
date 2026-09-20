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
    // Caps Vitest's worker count instead of forking per CPU core. Turbo
    // already runs multiple packages concurrently (--concurrency=2 for
    // test:unit), so uncapped per-package forking multiplies fast on a
    // shared/constrained host — confirmed by real OOM kills at the default.
    // Measured via `bun run validate` with a memory sampler running
    // alongside: uncapped got OOM-killed 3x; server/db/auth's
    // fileParallelism: false (1 worker) fixed that but roughly doubled the
    // test:unit stage (~4m47s -> ~8m28s); 2-4 workers all ran that stage in
    // ~4m20-47s (no further speedup past 2, since the stage is bottlenecked
    // by the slowest of Turbo's concurrent packages, not this file's worker
    // count) but 3-4 pinned host CPU above 80%. 2 avoids that while costing
    // nothing measurable versus 3 or 4.
    maxWorkers: 2,
    // Inherited by every project below; a project's own `setupFiles` add to it.
    setupFiles: ['./src/__tests__/setup/clock.ts'],
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
          include: [
            'src/**/*.component.test.{ts,tsx}',
            'tests/**/*.component.test.{ts,tsx}',
          ],
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
