import { m } from '@church/i18n/messages';
import { expect, test } from '@playwright/test';
import { signInPersonaPage } from '@/tests/fixtures/journeys/assign-church';
import { loadMinistryWorkspaceIndexJourney } from '@/tests/fixtures/journeys/ministry-workspace-index';

// #905 — with the API unreachable the page keeps its data under one
// reconnecting banner, the user stays signed in, and it recovers by itself.
const PT = { locale: 'pt-BR' } as const;
const API = '**/api/v1/**';
const READINESS = '**/api/health';

test('an unreachable API shows one reconnecting banner and the page recovers by itself', async ({
  page,
}, testInfo) => {
  const journey = loadMinistryWorkspaceIndexJourney({ testInfo });
  const { worship } = journey.ministries;
  await signInPersonaPage({ page, persona: journey.personas.admin });
  await page.goto('/app/ministries');
  const worshipLink = page.getByRole('link', {
    name: m.ministries_open_label({ name: worship.name }, PT),
  });
  await expect(worshipLink).toBeVisible();

  await page.route(API, (route) => route.abort('failed'));
  await page.route(READINESS, (route) => route.abort('failed'));
  // Coming back to the tab refetches the stale reads, which now fail. No
  // navigation: route guards and their outage handling are #906's.
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true })),
  );

  const banner = page.getByRole('status').filter({
    hasText: m.common_reconnecting({}, PT),
  });
  await expect(banner).toHaveCount(1);
  await expect(banner).toBeVisible();
  await expect(worshipLink).toBeVisible();
  await expect(page).toHaveURL(/\/ministries$/);

  await page.unroute(API);
  await page.unroute(READINESS);

  await expect(banner).toHaveCount(0, { timeout: 15_000 });
  await expect(worshipLink).toBeVisible();
  await expect(page).toHaveURL(/\/ministries$/);
});
