import { expect, type Page, test } from '@playwright/test';
import { VOLUNTEER_STORAGE_STATE } from '@/tests/fixtures/shared-personas';

// index.html paints an outline of AuthShell before any script runs; AuthShell
// removes it as it mounts. If the outline's panel is not where AuthShell's
// lands (the form heights in index.html are stale), the page jumps on load.
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];
const ROUTES = ['/login', '/forgot-password', '/reset-password?token=x'];

async function recordBootPanel(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const panel = document.querySelector('#boot-shell > div');
      (window as { bootPanel?: DOMRect }).bootPanel =
        panel?.getBoundingClientRect();
    });
  });
}

test.describe('sign-in boot shell', () => {
  for (const viewport of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`${route} at ${viewport.width}x${viewport.height}: AuthShell lands on the boot shell's panel`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await recordBootPanel(page);
        await page.goto(route);
        await expect(page.locator('.auth-panel')).toBeVisible();
        await expect(page.locator('#boot-shell')).toHaveCount(0);

        const [boot, real] = await page.evaluate(() => {
          const rect = document
            .querySelector('.auth-panel')
            ?.getBoundingClientRect();
          return [
            (window as { bootPanel?: DOMRect }).bootPanel,
            rect && { width: rect.width, height: rect.height },
          ];
        });
        expect(boot).toBeDefined();
        expect(Math.abs((boot?.width ?? 0) - (real?.width ?? 0))).toBeLessThan(
          2,
        );
        expect(
          Math.abs((boot?.height ?? 0) - (real?.height ?? 0)),
        ).toBeLessThan(2);
      });
    }
  }

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
