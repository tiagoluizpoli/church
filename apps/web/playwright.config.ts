import { defineConfig, devices } from '@playwright/test';

// Dedicated ports for the e2e run, distinct from the ports `bun run dev`
// binds (4000 API / 4001 web) — so `bunx playwright test` can run alongside
// an already-running local dev server instead of stealing its ports.
// Override via PW_SERVER_PORT/PW_WEB_PORT if these also collide.
const PW_SERVER_PORT = process.env.PW_SERVER_PORT ?? '4100';
const PW_WEB_PORT = process.env.PW_WEB_PORT ?? '4101';

// Host mirrors whatever `VITE_SERVER_URL` already points at (localhost, or a
// LAN IP for on-device mobile testing per apps/web/.env) — only the port
// changes.
const HOST = new URL(process.env.VITE_SERVER_URL ?? 'http://localhost:4000')
  .hostname;
const SERVER_URL = `http://${HOST}:${PW_SERVER_PORT}`;
const WEB_URL = `http://${HOST}:${PW_WEB_PORT}`;

// global-setup.ts and specs that build their own SERVER_URL the same way
// apps/web's client code does (e.g. us4-roster-publish.spec.ts) read
// `process.env.VITE_SERVER_URL` directly — overriding it here, before
// Playwright spawns global-setup or any worker, keeps every consumer
// pointed at this e2e-only server instance instead of whatever `bun dev`
// is bound to. PW_WEB_URL is this same idea for the handful of specs that
// need a second browser context's own `baseURL` (multi-session specs) —
// read it instead of re-deriving the web port, which used to be hardcoded
// as "SERVER_URL's port + 1" and silently broke once the ports diverged.
process.env.VITE_SERVER_URL = SERVER_URL;
process.env.PW_WEB_URL = WEB_URL;

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',
  timeout: 90_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
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
      testIgnore: '**/mobile-layout.spec.ts',
    },
    // Real device emulation (touch, mobile UA, viewport) for the one spec
    // that's purely mobile-shell coverage. Every other spec exercises both
    // layouts inside one flow via `test.use({ viewport })` per describe
    // block — those stay on `chromium` so a single seeded cycle/session
    // isn't driven twice per project.
    {
      name: 'mobile-chromium',
      // Pixel 5, not iPhone 12 — every device preset in the iPhone family
      // defaults `defaultBrowserType` to `webkit`, which isn't installed in
      // this repo's Playwright setup (chromium-only, see webServer above).
      // Pixel 5 gives the same isMobile/hasTouch/viewport emulation on
      // chromium.
      use: { ...devices['Pixel 5'] },
      testMatch: '**/mobile-layout.spec.ts',
    },
  ],
  webServer: [
    {
      command: 'bun run --cwd ../server dev',
      url: `${SERVER_URL}/api/auth/get-session`,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      // Root .env pins PORT/CORS_ORIGIN/BETTER_AUTH_URL to the normal dev
      // ports (4000/4001) for everyday `bun run dev`. These win over that
      // file — the server's own `--env-file=../../.env` load only fills in
      // variables not already set in process.env, so the e2e instance binds
      // to PW_SERVER_PORT and trusts WEB_URL as its CORS/auth origin instead
      // of colliding with (or being rejected by) a locally-running server.
      env: {
        PORT: PW_SERVER_PORT,
        CORS_ORIGIN: WEB_URL,
        BETTER_AUTH_URL: SERVER_URL,
      },
    },
    {
      command: 'bun run dev',
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      // See apps/web/vite.config.ts — `server.port` reads `process.env.PORT`
      // with the normal-dev 4001 as fallback.
      env: {
        PORT: PW_WEB_PORT,
        VITE_SERVER_URL: SERVER_URL,
      },
    },
  ],
});
