import type { Browser, Page } from '@playwright/test';
import { devTarget, launchSystemChrome } from '../perf/browser';
import { ensureApiServer, ensureWebDevServer } from '../perf/dev-servers';

/**
 * The cap on module requests `/login` makes under `vite dev` (#1174): vite
 * serves modules unbundled, so one change can add thousands (#1121 did).
 */

// 201 on 2026-11-27 plus about 10% (docs/agents/tooling.md, "Dev module cap").
const CAP = 220;

interface JudgeModuleRequestsInput {
  count: number;
  cap: number;
}

export function judgeModuleRequests({ count, cap }: JudgeModuleRequestsInput) {
  const lines = [
    `/login under vite dev: ${count} module requests, cap ${cap}.`,
  ];
  const passed = count > 0 && count <= cap;
  if (passed) {
    lines.push('Dev module cap passed.');
  } else if (count === 0) {
    lines.push(
      'Dev module cap FAILED: nothing was counted, so the page did not load from vite dev.',
    );
  } else {
    lines.push(
      `Dev module cap FAILED: ${count - cap} over the cap. Look for a change that compiles or imports many more modules in dev.`,
    );
  }
  return { lines, passed };
}

interface CountInput {
  browser: Browser;
  webOrigin: string;
}

interface PageInput {
  page: Page;
}

const LOAD_TIMEOUT_MS = 120_000;
// The lazy chunks the form pulls in arrive well within this.
const QUIET_MS = 3_000;
const POLL_INTERVAL_MS = 200;
const SUBMIT_BUTTON = '#app form button[type="submit"]';

/** Resolves once `lastAt` stops moving for `QUIET_MS`. */
async function waitUntilQuiet(
  input: PageInput & { lastAt: () => number },
): Promise<void> {
  const { page, lastAt } = input;
  const deadline = performance.now() + LOAD_TIMEOUT_MS;
  while (performance.now() - lastAt() < QUIET_MS) {
    if (performance.now() > deadline) {
      throw new Error('/login never stopped requesting modules.');
    }
    await page.waitForTimeout(POLL_INTERVAL_MS);
  }
}

/** Script requests to vite until the form shows and the page goes quiet. */
async function countModuleRequests(input: CountInput): Promise<number> {
  const { browser, webOrigin } = input;
  // The PWA's service worker would answer some of them itself.
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  let count = 0;
  let lastAt = performance.now();
  page.on('request', (request) => {
    // Vite reloads the page after optimizing a new dependency: count the last load.
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      count = 0;
    }
    const isModule =
      request.resourceType() === 'script' &&
      request.url().startsWith(`${webOrigin}/`);
    if (!isModule) return;
    count += 1;
    lastAt = performance.now();
  });

  await page.goto(`${webOrigin}/login`, { timeout: LOAD_TIMEOUT_MS });
  await page.waitForSelector(SUBMIT_BUTTON, { timeout: LOAD_TIMEOUT_MS });
  await waitUntilQuiet({ page, lastAt: () => lastAt });
  await context.close();
  return count;
}

async function measure(): Promise<number> {
  const { root, ports, webOrigin } = devTarget({ cwd: process.cwd() });
  const api = await ensureApiServer({ root, port: ports.server });
  try {
    const web = await ensureWebDevServer({ root, port: ports.web });
    try {
      const browser = await launchSystemChrome({ headed: false });
      try {
        return await countModuleRequests({ browser, webOrigin });
      } finally {
        await browser.close();
      }
    } finally {
      web.stop();
    }
  } finally {
    api.stop();
  }
}

if (import.meta.main) {
  try {
    const count = await measure();
    const { lines, passed } = judgeModuleRequests({ count, cap: CAP });
    console.log(lines.join('\n'));
    process.exit(passed ? 0 : 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Dev module cap FAILED: ${message}`);
    process.exit(1);
  }
}
