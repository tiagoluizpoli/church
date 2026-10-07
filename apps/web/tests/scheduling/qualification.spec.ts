import { expect, test } from '@playwright/test';
import { requiredE2eUrl } from '../fixtures/e2e-urls';
import {
  loadRosterQualificationJourney,
  type RosterQualificationJourney,
} from '../fixtures/journeys/roster-qualification';
import {
  newPersonaContext,
  requirementCellTestId,
  rosteringBuilderPath,
  signInPersonaPage,
  worshipBuilderPath,
} from '../fixtures/journeys/rostering-church';

const SERVER_URL = requiredE2eUrl({ variable: 'VITE_SERVER_URL' });

/**
 * 023 qualification + multi-team model.
 *
 * These specs assert the *rule*, not the rendering: a volunteer becomes a
 * candidate for a shift because they hold the required role qualification, and
 * for no other reason. The roster-qualification recipe makes that separable:
 * the journey's own cycle has one Event needing a Team Alpha Greeter and an
 * Usher. Grace (Team Alpha) and Ada (no Team) are qualified for both Roles,
 * the TeamLeader only as an Usher, and `Ursula Unqualified` is an active
 * member of the same ministry and the same team as the TeamLeader, but holds
 * no qualification at all. Anything that lets her through is an eligibility
 * bug, not a styling one.
 */

// The volunteer-pool rail abbreviates via formatVolunteerName (FR-013) —
// "First L." — while the assignment chip shows the full name. Both forms are
// asserted where each appears (see us4-roster-publish.spec.ts). These match
// the recipe's pool names (journey.pool.*.name).
const UNQUALIFIED_SHORT_NAME = 'Ursula U.';
const QUALIFIED_SHORT_NAME = 'Grace H.';
const OUTSIDE_TEAM_SHORT_NAME = 'Ada L.';

interface JourneyInput {
  journey: RosterQualificationJourney;
}

function teamBuilderUrl({ journey }: JourneyInput): string {
  return worshipBuilderPath({
    journey,
    teamId: journey.ministries.worship.teams.alpha.id,
  });
}

test.describe('qualification governs candidacy', () => {
  test('a ministry member with no role qualification is never offered as a candidate', async ({
    page,
  }, testInfo) => {
    const journey = loadRosterQualificationJourney({ testInfo });
    await signInPersonaPage({ page, persona: journey.personas.leader });

    await page.goto(worshipBuilderPath({ journey }));
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
      rail.getByText(journey.pool.ursula.name, { exact: false }),
    ).toHaveCount(0);
    // The journey owns every candidate, so the rail is exactly the three
    // qualified members: Grace, Ada and the TeamLeader (an Usher).
    await expect(rail.getByTestId('volunteer-card')).toHaveCount(3);
    await expect(
      rail.getByText(QUALIFIED_SHORT_NAME, { exact: false }),
    ).toHaveCount(1);
    await expect(
      rail.getByText(UNQUALIFIED_SHORT_NAME, { exact: false }),
    ).toHaveCount(0);
  });

  test('the volunteer rail states which roles each candidate is qualified for', async ({
    page,
  }, testInfo) => {
    const journey = loadRosterQualificationJourney({ testInfo });
    await signInPersonaPage({ page, persona: journey.personas.leader });

    await page.goto(worshipBuilderPath({ journey }));
    await expect(page.getByTestId('cycle-builder')).toBeVisible({
      timeout: 15_000,
    });

    // Every candidate earns their place through a qualification, so
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
  test('a TeamLeader sees their own team’s qualified members and still never the unqualified one', async ({
    page,
  }, testInfo) => {
    const journey = loadRosterQualificationJourney({ testInfo });
    await signInPersonaPage({ page, persona: journey.personas.teamLeader });

    // The capability index has its own API seam. This proof is about the
    // Team-scoped roster, whose stable public entry point is the roster link.
    await page.goto(teamBuilderUrl({ journey }));
    await expect(page.getByTestId('cycle-builder')).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole('button', { name: 'Publish cycle' }),
    ).toHaveCount(0);

    const rail = page.getByTestId('volunteer-pool');
    await expect(rail).toBeVisible();

    // Grace shares Team Alpha with the TeamLeader and is qualified: visible. The
    // rail abbreviates to "First L." (FR-013), so match that form.
    await expect(
      rail.getByText(QUALIFIED_SHORT_NAME, { exact: false }),
    ).toHaveCount(1);
    // Ursula shares the same team, so her absence isolates qualification as
    // the cause — team scoping alone would have let her through.
    await expect(
      rail.getByText(UNQUALIFIED_SHORT_NAME, { exact: false }),
    ).toHaveCount(0);
    await expect(
      rail.getByText(OUTSIDE_TEAM_SHORT_NAME, { exact: false }),
    ).toHaveCount(0);
  });

  test('a TeamLeader assigns and removes a led-Team roster seat, but cannot mutate an unled requirement', async ({
    browser,
    page,
  }, testInfo) => {
    const journey = loadRosterQualificationJourney({ testInfo });
    const { event } = journey;
    const teamId = journey.ministries.worship.teams.alpha.id;
    const grace = journey.pool.grace;

    // The recipe's Event starts at availability_fired/draft so discovery
    // coverage can prove its safe default. Stage it through the leader-facing
    // API: scheduling its draft Event, then assigning Grace, moves the
    // MinistryParticipation into rostering.
    const leaderContext = await newPersonaContext({
      browser,
      persona: journey.personas.leader,
    });
    const scheduleResponse = await leaderContext.request.patch(
      `${SERVER_URL}/api/v1/admin/planning-cycles/${journey.cycle.id}/events/${event.id}`,
      { data: {} },
    );
    expect(scheduleResponse.ok()).toBeTruthy();

    const stageResponse = await leaderContext.request.post(
      `${SERVER_URL}/api/v1/rostering/shifts/${event.shiftId}/assignments`,
      {
        data: {
          volunteerId: grace.volunteerId,
          roleId: event.requirements.greeter.roleId,
          teamId,
        },
      },
    );
    expect(stageResponse.status()).toBe(201);
    await leaderContext.close();

    await signInPersonaPage({ page, persona: journey.personas.teamLeader });
    await page.goto(teamBuilderUrl({ journey }));
    await expect(page.getByTestId('cycle-builder')).toBeVisible({
      timeout: 15_000,
    });

    const ledRequirement = page.getByTestId(
      requirementCellTestId({
        shiftId: event.shiftId,
        roleId: event.requirements.greeter.roleId,
      }),
    );
    await expect(ledRequirement.getByTestId('assignment-chip')).toContainText(
      grace.name,
    );
    // A Team route receives only that Team's requirements; an unled cell is
    // therefore absent rather than present-but-disabled. The forged request
    // below proves the server still denies the boundary.
    await expect(
      page.getByTestId(
        requirementCellTestId({
          shiftId: event.shiftId,
          roleId: event.requirements.usher.roleId,
        }),
      ),
    ).toHaveCount(0);

    const removeResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        response.url().includes('/api/v1/rostering/assignments/') &&
        response.url().includes(`teamId=${teamId}`),
    );
    await ledRequirement.getByTestId('assignment-chip').click();
    await page
      .getByTestId('assignment-picker')
      .getByRole('button', { name: 'Unassign' })
      .click();
    // "Unassign" opens a confirm dialog rather than deleting outright — the
    // DELETE only fires once the leader confirms.
    await page.getByRole('button', { name: 'Remove assignment' }).click();
    expect((await removeResponse).status()).toBe(204);
    await expect(ledRequirement.getByTestId('assignment-chip')).toHaveCount(0);

    const createResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response
          .url()
          .includes(`/api/v1/rostering/shifts/${event.shiftId}/assignments`),
    );
    await ledRequirement.getByRole('button', { name: 'Add' }).click();
    // Grace is Team Alpha's only qualified, available, not-yet-serving
    // candidate for this role, so she surfaces as the one suggestion rather
    // than in the plain (non-suggested) picker list.
    const suggestions = page
      .getByTestId('assignment-picker')
      .getByTestId('suggestion-option');
    await expect(suggestions).toHaveCount(1);
    await suggestions.filter({ hasText: grace.name }).click();
    const createdResponse = await createResponse;
    expect(createdResponse.status()).toBe(201);
    const { assignment: recreatedAssignment } = await createdResponse.json();
    await expect(ledRequirement.getByTestId('assignment-chip')).toContainText(
      grace.name,
    );

    const unledResponse = await page.request.post(
      `${SERVER_URL}/api/v1/rostering/shifts/${event.shiftId}/assignments`,
      {
        data: {
          volunteerId: grace.volunteerId,
          roleId: event.requirements.usher.roleId,
          teamId,
        },
      },
    );
    expect(unledResponse.status()).toBe(403);
    await expect(ledRequirement.getByTestId('assignment-chip')).toBeVisible();

    // The TeamLeader can also remove the recreated seat directly over the
    // API, bypassing the UI.
    const cleanupResponse = await page.request.delete(
      `${SERVER_URL}/api/v1/rostering/assignments/${recreatedAssignment.id}?teamId=${teamId}`,
    );
    expect(cleanupResponse.status()).toBe(204);
  });

  test('a wrong-Team roster link returns to Scheduling without roster data', async ({
    page,
  }, testInfo) => {
    const journey = loadRosterQualificationJourney({ testInfo });
    await signInPersonaPage({ page, persona: journey.personas.teamLeader });

    // Care's Team: one the TeamLeader does not lead, in another Ministry.
    await page.goto(
      rosteringBuilderPath({
        ministryId: journey.ministries.worship.id,
        teamId: journey.ministries.care.teams.care.id,
      }),
    );

    await expect(page).toHaveURL(/\/scheduling$/);
    await expect(
      page.getByRole('heading', { name: 'Scheduling' }),
    ).toBeVisible();
    await expect(page.getByTestId('team-roster-cycles')).toHaveCount(0);
  });
});
