import { expect, test } from '@playwright/test';
import { CHURCH_ADMIN_STORAGE_STATE } from '../global-setup';

// P9/T064 (test-master, catastrophic-failure coverage): a ChurchAdmin from
// Church A must never see Church B's cycle data through the new
// `/scheduling/planning-cycles/$cycleId` dynamic segment (T059), even when
// visiting it directly by URL with a known-valid foreign id.
const SERVER_URL = process.env.VITE_SERVER_URL ?? 'http://localhost:4000';

// Fixed E2E seed identifiers (apps/server/src/test-support/e2e-seed.ts
// E2E_IDS.churchBPlanningCycle / CHURCH_B_PLANNING_CYCLE_NAME) — same
// convention as cross-cutting.spec.ts: the web package stays
// DB-tooling-free, so this spec references the well-known values directly.
const CHURCH_B_CYCLE_ID = 'e2ebbbbb-2111-1111-1111-111111111111';
const CHURCH_B_CYCLE_NAME = 'E2E ChurchB Isolated Cycle';

test.describe('DL4-X1 cross-tenant isolation on the $cycleId route', () => {
  test.use({ storageState: CHURCH_ADMIN_STORAGE_STATE });

  test('a churchA admin visiting /scheduling/planning-cycles/:cycleId with a churchB id sees no churchB data', async ({
    page,
  }) => {
    const detailResponse = await page.request.get(
      `${SERVER_URL}/api/v1/admin/planning-cycles/${CHURCH_B_CYCLE_ID}`,
    );
    expect(detailResponse.status()).toBe(404);

    await page.goto(`/scheduling/planning-cycles/${CHURCH_B_CYCLE_ID}`);

    // No churchB cycle name, dates, or events ever render for this tenant —
    // the route falls back to its "no cycle" state instead of leaking data.
    await expect(page.getByText(CHURCH_B_CYCLE_NAME)).toHaveCount(0);
    await expect(page.getByTestId('selected-cycle-name')).toHaveCount(0);
    await expect(page.getByTestId('planning-events-list')).toHaveCount(0);
    await expect(
      page.getByText('Pick a cycle to review its generated calendar.'),
    ).toBeVisible();
  });
});
