import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Browser, CDPSession, Page } from '@playwright/test';
import { type DevTarget, devTarget, launchSystemChrome } from './browser';
import { ensureApiServer } from './dev-servers';
import { startDistServer } from './dist-server';
import { formatSignInReport, type SignInTimings } from './sign-in-report';

/**
 * `bun run perf:sign-in [--headed]`: first paint, LCP and form-ready times of a
 * production `/login` on a slow phone, plus a filmstrip
 * (docs/agents/tooling.md, "Sign-in load harness").
 */

interface Frame {
  /** Milliseconds since navigation start. */
  atMs: number;
  png: Buffer;
}

interface ScreencastFrame {
  atEpochSeconds: number;
  data: string;
}

interface PageTimings extends SignInTimings {
  timeOrigin: number;
}

interface SignInLoad {
  timings: SignInTimings;
  frames: Frame[];
}

interface BrowserInput {
  browser: Browser;
  url: string;
}

interface SessionInput {
  session: CDPSession;
}

interface PageInput {
  page: Page;
}

interface FramesInput {
  directory: string;
  frames: Frame[];
}

interface TargetInput {
  target: DevTarget;
}

interface MeasureInput extends TargetInput {
  headed: boolean;
}

// A 390x844 phone on Slow 4G (150 ms RTT, 1.6 Mbps) with a 4x slower CPU, as
// #1121 measured.
const VIEWPORT = { width: 390, height: 844 };
const DEVICE_SCALE_FACTOR = 2;
const CPU_SLOWDOWN = 4;
const LATENCY_MS = 150;
const DOWNLOAD_BYTES_PER_SECOND = (1.6 * 1_000_000) / 8;
const UPLOAD_BYTES_PER_SECOND = (750 * 1_000) / 8;
const CONDITIONS = 'Slow 4G, 4x CPU, 390x844';

const FRAME_WIDTH = 400;
const FRAME_HEIGHT = 870;
const FRAME_SPACING_MS = 200;
// The animation takes over from the still after the form, later when drawn in
// software: film it arriving.
const SETTLE_MS = 4_000;
const HEADED_FLAG = '--headed';
const LOAD_TIMEOUT_MS = 60_000;
const MS_PER_SECOND = 1000;
const FRAMES_DIRECTORY = 'tmp/perf-sign-in';

/** Runs in the page before any of its scripts. */
function recordSignInMoments(): void {
  const moments = { lcpMs: 0, formReadyMs: 0 };
  Object.assign(window, { signInMoments: moments });

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) moments.lcpMs = entry.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });

  // Usable: React's submit button is on screen and enabled, and the boot
  // shell's outline of the form is gone. Timed after the frame that shows it.
  const observer = new MutationObserver(() => {
    const button = document.querySelector<HTMLButtonElement>(
      '#app form button[type="submit"]',
    );
    const isShellGone = !document.getElementById('boot-shell');
    if (!button || button.disabled || !button.offsetParent || !isShellGone) {
      return;
    }
    observer.disconnect();
    requestAnimationFrame(() => {
      setTimeout(() => {
        moments.formReadyMs = performance.now();
      });
    });
  });
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
  });
}

async function throttle(input: SessionInput): Promise<void> {
  const { session } = input;
  await session.send('Network.enable');
  await session.send('Network.setCacheDisabled', { cacheDisabled: true });
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: LATENCY_MS,
    downloadThroughput: DOWNLOAD_BYTES_PER_SECOND,
    uploadThroughput: UPLOAD_BYTES_PER_SECOND,
  });
  await session.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
}

async function film(input: SessionInput): Promise<ScreencastFrame[]> {
  const { session } = input;
  const frames: ScreencastFrame[] = [];
  session.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    frames.push({ data, atEpochSeconds: metadata.timestamp ?? 0 });
    // The last frames can arrive while the page is closing.
    session.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await session.send('Page.startScreencast', {
    format: 'png',
    maxWidth: FRAME_WIDTH,
    maxHeight: FRAME_HEIGHT,
  });
  return frames;
}

async function readTimings(input: PageInput): Promise<PageTimings> {
  return input.page.evaluate(() => {
    const { signInMoments } = window as unknown as {
      signInMoments: { lcpMs: number; formReadyMs: number };
    };
    const [paint] = performance.getEntriesByName('first-paint');
    return {
      ...signInMoments,
      firstPaintMs: paint?.startTime ?? 0,
      timeOrigin: performance.timeOrigin,
    };
  });
}

async function loadSignIn(input: BrowserInput): Promise<SignInLoad> {
  const { browser, url } = input;
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    isMobile: true,
    // The harness's certificate is self-signed.
    ignoreHTTPSErrors: true,
    hasTouch: true,
    locale: 'pt-BR',
  });
  const page = await context.newPage();
  await page.addInitScript(recordSignInMoments);
  const session = await context.newCDPSession(page);
  await throttle({ session });
  const screencast = await film({ session });

  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForFunction(
    () =>
      (window as unknown as { signInMoments?: { formReadyMs: number } })
        .signInMoments?.formReadyMs,
    undefined,
    { timeout: LOAD_TIMEOUT_MS },
  );
  await page.waitForTimeout(SETTLE_MS);

  const { timeOrigin, ...timings } = await readTimings({ page });
  await context.close();

  const missing = Object.entries(timings).filter(([, ms]) => ms <= 0);
  if (missing.length > 0) {
    const names = missing.map(([name]) => name).join(', ');
    throw new Error(`The page reported no ${names}.`);
  }

  const frames: Frame[] = [];
  for (const { atEpochSeconds, data } of screencast) {
    const atMs = Math.round(atEpochSeconds * MS_PER_SECOND - timeOrigin);
    const previous = frames.at(-1)?.atMs ?? Number.NEGATIVE_INFINITY;
    if (atMs < 0 || atMs - previous < FRAME_SPACING_MS) continue;
    frames.push({ atMs, png: Buffer.from(data, 'base64') });
  }

  return { timings, frames };
}

function saveFrames(input: FramesInput): void {
  const { directory, frames } = input;
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  for (const { atMs, png } of frames) {
    const name = `frame-${String(atMs).padStart(5, '0')}ms.png`;
    writeFileSync(join(directory, name), png);
  }
}

function buildWeb(input: TargetInput): void {
  execFileSync('bun', ['run', 'build', '--filter=web'], {
    cwd: input.target.root,
    env: { ...process.env, VITE_SERVER_URL: '/' },
    stdio: 'inherit',
  });
}

async function measure(input: MeasureInput): Promise<void> {
  const { root, ports, webOrigin } = input.target;
  // HTTPS: HTTP/2, which the deployment speaks, needs it.
  const url = `${webOrigin.replace('http:', 'https:')}/login`;
  const api = await ensureApiServer({ root, port: ports.server });

  try {
    const server = await startDistServer({
      distDirectory: join(root, 'apps/web/dist'),
      apiPort: ports.server,
      port: ports.web,
    });
    try {
      const { headed } = input;
      const browser = await launchSystemChrome({ headed });
      try {
        const { timings, frames } = await loadSignIn({ browser, url });
        const directory = join(root, FRAMES_DIRECTORY);
        saveFrames({ directory, frames });
        const report = formatSignInReport({
          url,
          conditions: CONDITIONS,
          timings,
          frames: {
            count: frames.length,
            directory: relative(root, directory),
          },
        });
        console.log(report.join('\n'));
      } finally {
        await browser.close();
      }
    } finally {
      server.close();
    }
  } finally {
    api.stop();
  }
}

async function main(): Promise<void> {
  try {
    const target = devTarget({ cwd: process.cwd() });
    buildWeb({ target });
    const headed = process.argv.includes(HEADED_FLAG);
    await measure({ target, headed });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✖ perf:sign-in failed: ${message}`);
    process.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
