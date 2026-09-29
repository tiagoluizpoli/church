import { defineConfig, devices } from '@playwright/test';
import {
  applyE2eUrlSet,
  deriveE2eUrlSet,
  serverProcessEnv,
  webProcessEnv,
} from '../../tooling/env/e2e-environment';

// One URL set for the whole run (ADR-0005): pinned into process.env before
// Playwright spawns global setup or any worker, so setup, the provisioning
// scripts, specs (VITE_SERVER_URL, PW_WEB_URL) and both webServers agree on
// server, web, CORS and authentication origins instead of a value file's.
const urlSet = deriveE2eUrlSet({ env: process.env });
const SERVER_URL = urlSet.serverUrl;
const WEB_URL = urlSet.webUrl;
applyE2eUrlSet({ env: process.env, urlSet });

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',
  timeout: 90_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    headless: true,
    locale: 'pt-BR',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'bun run --cwd ../server start:e2e',
      url: `${SERVER_URL}/api/auth/get-session`,
      // An already-running process may target a different database or API
      // origin than this run's global setup. Failing on a port collision is
      // safer than silently executing against that mixed stack.
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      // start:e2e runs through Varlock with the e2e purpose, so the server
      // resolves its database through the typed E2E target and logs the
      // same fingerprint as setup. These win over any value file: Varlock
      // never overrides a variable already present in the process env.
      env: serverProcessEnv({ urlSet }),
    },
    {
      command: 'bun run dev',
      url: WEB_URL,
      // Keep the browser and seed process paired with the server above.
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      // See apps/web/vite.config.ts: `server.port` reads `process.env.PORT`.
      env: webProcessEnv({ urlSet }),
    },
  ],
});
