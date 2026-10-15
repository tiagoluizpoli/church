import { expect, test } from '@playwright/test';
import { requiredE2eUrl } from '@/tests/fixtures/e2e-urls';
import { signInPersonaPage } from '@/tests/fixtures/journeys/assign-church';
import { loadCycleTenantsJourney } from '@/tests/fixtures/journeys/cycle-tenants';

// P9/T064 (test-master, catastrophic-failure coverage): a ChurchAdmin from
// Church A must never see Church B's cycle data through the
// `/cycles/$cycleId` dynamic segment (T059), even when
// visiting it directly by URL with a known-valid foreign id.
const SERVER_URL = requiredE2eUrl({ variable: 'VITE_SERVER_URL' });

test.describe('DL4-X1 cross-tenant isolation on the $cycleId route', () => {
  test('a churchA admin visiting /cycles/:cycleId with a churchB id sees no churchB data', async ({
    page,
  }, testInfo) => {
    const { churchA, churchB } = loadCycleTenantsJourney({ testInfo });
    await signInPersonaPage({ page, persona: churchA.personas.admin });

    const detailResponse = await page.request.get(
      `${SERVER_URL}/api/v1/admin/cycles/${churchB.cycle.id}`,
    );
    expect(detailResponse.status()).toBe(404);

    await page.goto(`/cycles/${churchB.cycle.id}`);

    // No churchB cycle name, dates, or events ever render for this tenant —
    // the route falls back to its "no cycle" state instead of leaking data.
    await expect(page.getByText(churchB.cycle.name)).toHaveCount(0);
    await expect(page.getByTestId('selected-cycle-name')).toHaveCount(0);
    await expect(page.getByTestId('planning-events-list')).toHaveCount(0);
    await expect(
      page.getByText('Pick a cycle to review its generated calendar.'),
    ).toBeVisible();
  });
});
