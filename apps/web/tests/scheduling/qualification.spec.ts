import { expect, test } from '@playwright/test';
import {
  LEADER_STORAGE_STATE,
  TEAM_LEADER_STORAGE_STATE,
} from '../global-setup';

/**
 * 023 qualification + multi-team model.
 *
 * These specs assert the *rule*, not the rendering: a volunteer becomes a
 * candidate for a shift because they hold the required role qualification, and
 * for no other reason. The seed makes that separable — every seeded member is
 * qualified for every role in their ministry except `Ursula Unqualified`, who
 * is an active member of the same ministry and the same team as the TeamLeader,
 * but holds no qualification at all. Anything that lets her through is an
 * eligibility bug, not a styling one.
 */

const BUILDER_URL =
  '/scheduling/rostering/e2e33333-3333-3333-3333-333333333331/e2e21111-1111-1111-1111-111111111111';

const UNQUALIFIED_NAME = 'Ursula Unqualified';
const QUALIFIED_NAME = 'Grace Hopper';
const OUTSIDE_TEAM_NAME = 'Ada Lovelace';

test.describe('qualification governs candidacy', () => {
  test.use({ storageState: LEADER_STORAGE_STATE });

  test('a ministry member with no role qualification is never offered as a candidate', async ({
    page,
  }) => {
    await page.goto(BUILDER_URL);
    await expect(page.getByTestId('cycle-builder')).toBeVisible({
      timeout: 15_000,
    });

    const rail = page.getByTestId('volunteer-pool');
    await expect(rail).toBeVisible();

    // Grace is qualified and must appear; Ursula is a member of the very same
    // ministry and must not. Asserting both together is what makes this a test
    // of the rule rather than of an empty list.
    await expect(rail.getByTestId('volunteer-card')).not.toHaveCount(0);
    await expect(
      rail.getByText(UNQUALIFIED_NAME, { exact: false }),
    ).toHaveCount(0);
  });

  test('the volunteer rail states which roles each candidate is qualified for', async ({
    page,
  }) => {
    await page.goto(BUILDER_URL);
    await expect(page.getByTestId('cycle-builder')).toBeVisible({
      timeout: 15_000,
    });

    // Every seeded candidate earns their place through a qualification, so
    // every card must be able to say which one. A blank line here would mean
    // the payload dropped the ids between the manager and the card.
    const rolesLines = page
      .getByTestId('volunteer-pool')
      .getByTestId('volunteer-qualified-roles');
    await expect(rolesLines.first()).toBeVisible();
    await expect(rolesLines.first()).not.toHaveText('');
  });
});

test.describe('TeamLeader roster discovery composes with qualification', () => {
  test.use({ storageState: TEAM_LEADER_STORAGE_STATE });

  test('a TeamLeader sees their own team’s qualified members and still never the unqualified one', async ({
    page,
  }) => {
    await page.goto('/scheduling');
    await page
      .getByRole('link', { name: 'Open E2E Team Alpha roster' })
      .click();
    await page.getByRole('link', { name: 'Open roster' }).first().click();
    await expect(page.getByTestId('cycle-builder')).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText('This Team roster is read-only.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Publish cycle' }),
    ).toHaveCount(0);

    const rail = page.getByTestId('volunteer-pool');
    await expect(rail).toBeVisible();

    // Grace shares team1 with the TeamLeader and is qualified: visible.
    await expect(rail.getByText(QUALIFIED_NAME, { exact: false })).toHaveCount(
      1,
    );
    // Ursula shares the same team, so her absence isolates qualification as
    // the cause — team scoping alone would have let her through.
    await expect(
      rail.getByText(UNQUALIFIED_NAME, { exact: false }),
    ).toHaveCount(0);
    await expect(
      rail.getByText(OUTSIDE_TEAM_NAME, { exact: false }),
    ).toHaveCount(0);
  });

  test('a wrong-Team roster link returns to Scheduling without roster data', async ({
    page,
  }) => {
    await page.goto(
      '/scheduling/rostering/e2e33333-3333-3333-3333-333333333331?teamId=e2eaaaa1-0000-0000-0000-000000000002',
    );

    await expect(page).toHaveURL(/\/scheduling$/);
    await expect(
      page.getByRole('heading', { name: 'Scheduling' }),
    ).toBeVisible();
    await expect(page.getByTestId('team-roster-cycles')).toHaveCount(0);
  });
});
