import { appConfig } from '@church/app-config';
import { locales } from '@church/i18n/runtime';
import { expect, type Page, test } from '@playwright/test';
import { VOLUNTEER_STORAGE_STATE } from '@/tests/fixtures/shared-personas';

// index.html paints an outline of AuthShell and its form before any script
// runs; AuthShell removes it as it mounts. Every bar of that outline must land
// on the element it stands for, in every locale, or the page jumps on load.
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  // Split, with the 28rem form column.
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
];
const ROUTES = ['/login', '/forgot-password', '/reset-password?token=x'];
const ENTRY = /\/src\/main\.tsx(\?.*)?$/;
const TOLERANCE_PX = 2;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Outline {
  panel: Box;
  texts: { text: string; lines: Box[] }[];
  boxes: Box[];
}

declare global {
  interface Window {
    lineBoxes: (node: Node) => Box[];
    bootShellRemovedWithAuthShell?: boolean;
    bootShell?: { html: string; shown: boolean; lang: string };
  }
}

function withLocale(route: string, locale: string) {
  return `${route}${route.includes('?') ? '&' : '?'}${appConfig.localeQueryParam}=${locale}`;
}

// Both sides are measured in the same fonts: the web fonts where they load
// (playwright.config.ts keeps them out of e2e), the fallback otherwise.
async function waitForFonts(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.fonts.status === 'loaded');
}

/** The boot shell as parsed, put back beside the mounted AuthShell: both measured in one layout. */
async function measureBootShell(page: Page): Promise<Outline> {
  return page.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', window.bootShell?.html ?? '');
    const shell = document.getElementById('boot-shell');
    const root = [...(shell?.querySelectorAll('.boot-form') ?? [])].find(
      (element) => getComputedStyle(element).display !== 'none',
    );
    const panel = shell
      ?.querySelector('.auth-shell-panel')
      ?.getBoundingClientRect()
      .toJSON();
    const outline = {
      panel,
      texts: [...(root?.querySelectorAll('[data-m]') ?? [])].map((element) => ({
        text: element.textContent ?? '',
        lines: element.firstChild ? window.lineBoxes(element.firstChild) : [],
      })),
      boxes: [
        ...(root?.querySelectorAll('.boot-input, .boot-button') ?? []),
      ].map((element) => element.getBoundingClientRect().toJSON()),
    };
    shell?.remove();
    return outline;
  });
}

async function measureAuthShell(page: Page, texts: string[]): Promise<Outline> {
  return page.evaluate((wanted) => {
    const main = document.querySelector('main');
    const nodes: Text[] = [];
    if (main) {
      const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        nodes.push(node as Text);
      }
    }
    return {
      panel: document
        .querySelector('.auth-panel')
        ?.getBoundingClientRect()
        .toJSON(),
      texts: wanted.map((text) => {
        const node = nodes.find((candidate) => candidate.data === text);
        return { text, lines: node ? window.lineBoxes(node) : [] };
      }),
      boxes: [
        ...document.querySelectorAll('main input, main button[type=submit]'),
      ].map((element) => element.getBoundingClientRect().toJSON()),
    };
  }, texts);
}

function expectSameBox(actual: Box, expected: Box, label: string) {
  for (const side of ['x', 'y', 'width', 'height'] as const) {
    expect(
      Math.abs(actual[side] - expected[side]),
      `${label}: ${side} ${actual[side]} vs ${expected[side]}`,
    ).toBeLessThan(TOLERANCE_PX);
  }
}

test.describe('sign-in boot shell', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.lineBoxes = (node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return [...range.getClientRects()].map((rect) => rect.toJSON());
      };
      // Whether the shell went in the commit that painted AuthShell, never before.
      new MutationObserver((records) => {
        for (const record of records) {
          for (const removed of record.removedNodes) {
            if (
              (removed as Element).id === 'boot-shell' &&
              window.bootShellRemovedWithAuthShell === undefined
            ) {
              window.bootShellRemovedWithAuthShell =
                document.querySelector('.auth-panel') !== null;
            }
          }
        }
      }).observe(document, { childList: true, subtree: true });
      // The shell as the parser left it, before any module script runs.
      document.addEventListener('readystatechange', () => {
        const shell = document.getElementById('boot-shell');
        if (document.readyState !== 'interactive' || !shell) return;
        window.bootShell = {
          html: shell.outerHTML,
          shown: getComputedStyle(shell).display !== 'none',
          lang: document.documentElement.lang,
        };
      });
    });
  });

  for (const locale of locales) {
    for (const viewport of VIEWPORTS) {
      for (const route of ROUTES) {
        test(`${route} in ${locale} at ${viewport.width}x${viewport.height}: every bar lands on its element`, async ({
          page,
        }) => {
          await page.setViewportSize(viewport);
          await page.goto(withLocale(route, locale));
          await expect(page.locator('main button[type=submit]')).toBeVisible();
          await expect(page.locator('#boot-shell')).toHaveCount(0);
          const parsed = await page.evaluate(() => window.bootShell);
          expect(parsed?.shown).toBe(true);
          expect(parsed?.lang).toBe(locale);
          await waitForFonts(page);
          const boot = await measureBootShell(page);
          const real = await measureAuthShell(
            page,
            boot.texts.map(({ text }) => text),
          );

          expect(await page.evaluate(() => document.documentElement.lang)).toBe(
            locale,
          );
          expectSameBox(boot.panel, real.panel, 'panel');
          expect(boot.texts.length).toBeGreaterThan(0);
          for (const [index, { text, lines }] of boot.texts.entries()) {
            const realLines = real.texts[index]?.lines ?? [];
            expect(realLines.length, `"${text}" lines`).toBe(lines.length);
            expect(lines.length, `"${text}" lines`).toBeGreaterThan(0);
            for (const [line, box] of lines.entries()) {
              const realLine = realLines[line];
              if (realLine)
                expectSameBox(box, realLine, `"${text}" line ${line + 1}`);
            }
          }
          expect(real.boxes.length).toBe(boot.boxes.length);
          for (const [index, box] of boot.boxes.entries()) {
            const realBox = real.boxes[index];
            if (realBox) expectSameBox(box, realBox, `control ${index + 1}`);
          }
          expect(
            await page.evaluate(() => window.bootShellRemovedWithAuthShell),
          ).toBe(true);
        });
      }
    }
  }

  test('the boot shell resolves the locale as the app does', async ({
    page,
    context,
    baseURL,
  }) => {
    const cases = [
      {
        cookie: undefined,
        query: undefined,
        expected: appConfig.defaultLocale,
      },
      { cookie: 'en', query: undefined, expected: 'en' },
      { cookie: 'EN', query: undefined, expected: 'en' },
      { cookie: 'en', query: 'pt-BR', expected: 'pt-BR' },
      { cookie: 'en', query: 'xx', expected: 'en' },
      { cookie: 'xx', query: undefined, expected: appConfig.defaultLocale },
    ];
    for (const { cookie, query, expected } of cases) {
      await context.clearCookies();
      if (cookie) {
        await context.addCookies([
          {
            name: appConfig.localeCookieName,
            value: cookie,
            url: baseURL ?? '',
          },
        ]);
      }
      await page.goto(query ? withLocale('/login', query) : '/login');
      await expect(page.locator('main button[type=submit]')).toBeVisible();
      const bootLocale = await page.evaluate(() => window.bootShell?.lang);
      const appLocale = await page.evaluate(
        () => document.documentElement.lang,
      );
      expect(
        [bootLocale, appLocale],
        JSON.stringify({ cookie, query }),
      ).toEqual([expected, expected]);
    }
  });

  test('states a fresh load does not show skip the boot shell', async ({
    page,
  }) => {
    for (const route of [
      '/login?notice=password-changed',
      '/reset-password',
      '/reset-password?token=x&error=INVALID_TOKEN',
    ]) {
      await page.goto(route);
      expect(
        await page.evaluate(
          () => 'bootShell' in document.documentElement.dataset,
        ),
        route,
      ).toBe(false);
    }
  });

  test('a stored theme the app does not know still shows the boot shell', async ({
    page,
  }) => {
    await page.addInitScript(() =>
      localStorage.setItem('vite-ui-theme', 'not a theme'),
    );
    // Only the boot script is under test: the app's own theme provider is not.
    await page.goto('/login', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.bootShell !== undefined);
    expect(await page.evaluate(() => window.bootShell?.shown)).toBe(true);
  });

  test.describe('a failed start never leaves the boot shell over the page', () => {
    test('the entry fails to load', async ({ page }) => {
      await page.route(ENTRY, (route) => route.abort());
      await page.goto('/login', { waitUntil: 'commit' });
      await expect(page.locator('#boot-shell')).toHaveCount(0);
    });

    test('the entry throws', async ({ page }) => {
      await page.route(ENTRY, (route) =>
        route.fulfill({
          contentType: 'text/javascript',
          body: "throw new Error('startup failure');",
        }),
      );
      await page.goto('/login', { waitUntil: 'commit' });
      await expect(page.locator('#boot-shell')).toHaveCount(0);
    });

    test('a module the entry imports fails to load', async ({ page }) => {
      await page.route(/\/src\/locale-init\.ts(\?.*)?$/, (route) =>
        route.abort(),
      );
      await page.goto('/login', { waitUntil: 'commit' });
      await expect(page.locator('#boot-shell')).toHaveCount(0);
    });

    test('the sign-in route fails to load', async ({ page }) => {
      await page.route(/\/src\/routes\/login\.tsx\?tsr-split/, (route) =>
        route.abort(),
      );
      await page.goto('/login', { waitUntil: 'commit' });
      await expect(page.locator('#boot-shell')).toHaveCount(0);
      await expect(page.locator('.auth-panel')).toHaveCount(0);
    });
  });

  test.describe('signed in', () => {
    test.use({ storageState: VOLUNTEER_STORAGE_STATE });

    test('sign-in redirects onward and the boot shell goes with it', async ({
      page,
    }) => {
      await page.goto('/login');
      await expect(page).toHaveURL(/:\d+\/app(\?.*)?$/);
      await expect(page.locator('#boot-shell')).toBeHidden();
    });

    test('other routes never show the boot shell', async ({ page }) => {
      await page.goto('/app');
      expect(
        await page.evaluate(
          () => 'bootShell' in document.documentElement.dataset,
        ),
      ).toBe(false);
      await expect(page.locator('#boot-shell')).toBeHidden();
    });
  });
});
