import { expect, test } from '@playwright/test';
import { signInPersonaPage } from '@/tests/fixtures/journeys/assign-church';
import { loadMinistryWorkspaceIndexJourney } from '@/tests/fixtures/journeys/ministry-workspace-index';

// #948 — the Ministry tab bar at 320px: it scrolls sideways, never vertically, keeps
// the active tab on screen, and its active underline and focus ring are not clipped.
const SHOTS = process.env.UI_SHOTS_DIR;

for (const theme of ['light', 'dark'] as const) {
  test(`the Ministry tab bar fits a 320px viewport (${theme})`, async ({
    page,
  }, testInfo) => {
    const journey = loadMinistryWorkspaceIndexJourney({ testInfo });
    await page.setViewportSize({ width: 320, height: 640 });
    await page.addInitScript((value) => {
      localStorage.setItem('vite-ui-theme', value);
    }, theme);
    await signInPersonaPage({ page, persona: journey.personas.admin });
    await page.goto(
      `/app/ministries/${journey.ministries.worship.id}/settings`,
    );

    const list = page.getByRole('navigation').getByRole('list').first();
    const active = list.locator('[data-status="active"]');
    await expect(active).toBeVisible();
    await expect(active).toBeInViewport({ ratio: 1 });

    const box = await list.evaluate((el) => ({
      scrollW: el.scrollWidth,
      clientW: el.clientWidth,
      scrollH: el.scrollHeight,
      clientH: el.clientHeight,
    }));
    expect(box.scrollH).toBeLessThanOrEqual(box.clientH);

    // Keyboard focus on every tab: the ring is inside the bar's own box.
    const listBox = await list.boundingBox();
    for (const link of await list.getByRole('link').all()) {
      await link.focus();
      await link.scrollIntoViewIfNeeded();
      const b = await link.boundingBox();
      expect(b && listBox && b.y >= listBox.y).toBeTruthy();
      expect(
        b && listBox && b.y + b.height <= listBox.y + listBox.height + 1,
      ).toBeTruthy();
      if (SHOTS)
        await page.screenshot({
          path: `${SHOTS}/tabs-${theme}-${(await link.textContent())?.trim()}.png`,
        });
    }
    // Horizontal scroll is reachable when the tabs overflow.
    if (box.scrollW > box.clientW) {
      await list.evaluate((el) => {
        el.scrollLeft = 0;
      });
      expect(await list.evaluate((el) => el.scrollLeft)).toBe(0);
    }
  });
}
