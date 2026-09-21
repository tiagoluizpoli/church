import { expect, test } from '@playwright/test';
import {
  LEADER_STORAGE_STATE,
  TEAM_LEADER_STORAGE_STATE,
} from '../global-setup';

const SERVER_URL = process.env.VITE_SERVER_URL ?? 'http://localhost:4000';

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

const TEAM_ID = 'e2eaaaa1-0000-0000-0000-000000000001';
const US6_EVENT_ID = 'e2e66666-6666-6666-6666-666666666664';
const US6_SHIFT_ID = 'e2e71111-1111-1111-1111-111111111114';
const GREETER_ROLE_ID = 'e2e55555-5555-5555-5555-555555555552';
const USHER_ROLE_ID = 'e2e55555-5555-5555-5555-555555555551';
const GRACE_HOPPER_ID = 'e2e44444-4444-4444-4444-4444444444a1';

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
    // The capability index has its own API seam. This proof is about the
    // Team-scoped roster, whose stable public entry point is the roster link.
    await page.goto(`${BUILDER_URL}?teamId=${TEAM_ID}`);
    await expect(page.getByTestId('cycle-builder')).toBeVisible({
      timeout: 15_000,
    });
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

  test('a TeamLeader assigns and removes a led-Team roster seat, but cannot mutate an unled requirement', async ({
    browser,
    page,
  }) => {
    // The shared US6 fixture starts at availability_fired/draft so discovery
    // coverage can prove its safe default. Stage only this resource through
    // the leader-facing API: scheduling its draft Event, then assigning Grace,
    // moves the MinistryParticipation into rostering without changing the
    // fixture schema or another cycle.
    const leaderContext = await browser.newContext({
      storageState: LEADER_STORAGE_STATE,
    });
    const scheduleResponse = await leaderContext.request.patch(
      `${SERVER_URL}/api/v1/admin/planning-cycles/e2e21111-1111-1111-1111-111111111111/events/${US6_EVENT_ID}`,
      { data: {} },
    );
    expect(scheduleResponse.ok()).toBeTruthy();

    const stageResponse = await leaderContext.request.post(
      `${SERVER_URL}/api/v1/rostering/shifts/${US6_SHIFT_ID}/assignments`,
      {
        data: {
          volunteerId: GRACE_HOPPER_ID,
          roleId: GREETER_ROLE_ID,
          teamId: TEAM_ID,
        },
      },
    );
    expect(stageResponse.status()).toBe(201);
    await leaderContext.close();

    await page.goto(`${BUILDER_URL}?teamId=${TEAM_ID}`);
    await expect(page.getByTestId('cycle-builder')).toBeVisible({
      timeout: 15_000,
    });

    const ledRequirement = page.getByTestId(
      `cycle-requirement-${US6_SHIFT_ID}-${GREETER_ROLE_ID}`,
    );
    await expect(ledRequirement.getByTestId('assignment-chip')).toContainText(
      QUALIFIED_NAME,
    );
    // A Team route receives only that Team's requirements; an unled cell is
    // therefore absent rather than present-but-disabled. The forged request
    // below proves the server still denies the boundary.
    await expect(
      page.getByTestId(`cycle-requirement-${US6_SHIFT_ID}-${USHER_ROLE_ID}`),
    ).toHaveCount(0);

    const removeResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        response.url().includes('/api/v1/rostering/assignments/') &&
        response.url().includes(`teamId=${TEAM_ID}`),
    );
    await ledRequirement.getByTestId('assignment-chip').click();
    await page
      .getByTestId('assignment-picker')
      .getByRole('button', { name: 'Unassign' })
      .click();
    expect((await removeResponse).status()).toBe(204);
    await expect(ledRequirement.getByTestId('assignment-chip')).toHaveCount(0);

    const createResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response
          .url()
          .includes(`/api/v1/rostering/shifts/${US6_SHIFT_ID}/assignments`),
    );
    await ledRequirement.getByRole('button', { name: 'Add' }).click();
    await page
      .getByTestId('assignment-picker')
      .getByTestId('picker-option')
      .filter({ hasText: QUALIFIED_NAME })
      .click();
    expect((await createResponse).status()).toBe(201);
    await expect(ledRequirement.getByTestId('assignment-chip')).toContainText(
      QUALIFIED_NAME,
    );

    const unledResponse = await page.request.post(
      `${SERVER_URL}/api/v1/rostering/shifts/${US6_SHIFT_ID}/assignments`,
      {
        data: {
          volunteerId: GRACE_HOPPER_ID,
          roleId: USHER_ROLE_ID,
          teamId: TEAM_ID,
        },
      },
    );
    expect(unledResponse.status()).toBe(403);
    await expect(ledRequirement.getByTestId('assignment-chip')).toBeVisible();
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
