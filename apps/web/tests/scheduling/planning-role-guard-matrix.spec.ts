import { expect, test } from '@playwright/test';
import { VOLUNTEER_STORAGE_STATE } from '../global-setup';

// P9/T065 (test-master: exhaustive permission-coverage). T057 only proved
// denial at /scheduling/planning-cycles (route-level redirect). This closes
// the matrix for the other two scheduling routes, which — per T057/BL-017 —
// have no route-level guard and instead rely on their data queries being
// server-side rejected for a plain Volunteer (no Leader/Sub-leader/ChurchAdmin
// capacity). "Denied" here means: no protected ministry/event/cycle data or
// mutating action is ever reachable, not necessarily a redirect.
test.describe('Volunteer-only denial across all 3 scheduling routes', () => {
  test.use({ storageState: VOLUNTEER_STORAGE_STATE });

  test('a Volunteer is denied at /scheduling/planning-cycles, /scheduling/tailoring, and the cycle builder', async ({
    page,
  }) => {
    await page.goto('/scheduling/planning-cycles');
    await expect(page).not.toHaveURL(/\/scheduling\/planning-cycles/);
    await expect(page.getByTestId('planning-admin-page')).toHaveCount(0);

    await page.goto('/scheduling/tailoring');
    await expect(page).toHaveURL('/scheduling/tailoring');
    await expect(page.getByRole('heading', { name: 'Scope' })).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'No ministries yet' }),
    ).toHaveCount(0);

    await page.goto(
      '/scheduling/rostering/e2e33333-3333-3333-3333-333333333331/e2e21111-1111-1111-1111-111111111111',
    );
    await expect(page.getByTestId('cycle-builder')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /publish cycle/i }),
    ).toHaveCount(0);
  });
});
