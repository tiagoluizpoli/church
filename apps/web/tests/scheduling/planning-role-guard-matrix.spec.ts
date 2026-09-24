import { expect, test } from '@playwright/test';
import { LEADER_STORAGE_STATE, VOLUNTEER_STORAGE_STATE } from '../global-setup';

// P9/T065 (test-master: exhaustive permission-coverage). T057 only proved
// denial at /scheduling/planning-cycles (route-level redirect). This closes
// the matrix for the other two scheduling routes, which — per T057/BL-017 —
// have no route-level guard and instead rely on their data queries being
// server-side rejected for a plain Volunteer (no Leader/TeamLeader/ChurchAdmin
// capacity). "Denied" here means: no protected ministry/event/cycle data or
// mutating action is ever reachable, not necessarily a redirect.
test.describe('Leader direct access to the other scheduling routes', () => {
  // #217 — merged in from the removed planning-role-guards.spec.ts: the
  // matrix's denial case is only half the authorization proof without a
  // positive control showing the same two routes are actually reachable for
  // a role that does hold access. ChurchAdmin's positive load of
  // /scheduling/planning-cycles is not re-asserted here — us1-admin-plan.spec.ts
  // already drives that URL and interacts with page content only reachable
  // once the planning-admin page has rendered (e.g. opening the create-cycle
  // dialog), which is stronger implicit proof than the deleted spec's bare
  // getByTestId('planning-admin-page') visibility check.
  test.use({ storageState: LEADER_STORAGE_STATE });

  test('a Leader can load /scheduling/tailoring and the cycle builder directly', async ({
    page,
  }) => {
    await page.goto('/scheduling/tailoring');
    await expect(page).toHaveURL('/scheduling/tailoring');

    await page.goto(
      '/scheduling/rostering/e2e33333-3333-3333-a333-333333333331/e2e21111-1111-1111-a111-111111111111',
    );
    await expect(page.getByTestId('cycle-builder')).toBeVisible();
  });
});

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
      '/scheduling/rostering/e2e33333-3333-3333-a333-333333333331/e2e21111-1111-1111-a111-111111111111',
    );
    await expect(page.getByTestId('cycle-builder')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /publish cycle/i }),
    ).toHaveCount(0);
  });
});
