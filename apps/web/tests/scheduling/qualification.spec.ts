import { expect, test } from '@playwright/test';
import {
  signInPersonaPage,
  worshipBuilderPath,
} from '@/tests/fixtures/journeys/assign-church';
import { loadAssignQualificationJourney } from '@/tests/fixtures/journeys/assign-qualification';

/**
 * 023 qualification.
 *
 * These specs assert the *rule*, not the rendering: a volunteer becomes a
 * candidate for a shift because they hold the required role qualification, and
 * for no other reason. The assign-qualification recipe makes that separable:
 * the journey's own cycle has one Event needing a Greeter and an Usher.
 * Grace and Ada are qualified for both Roles, the plain Volunteer only as an
 * Usher, and `Ursula Unqualified` is an active member of the same ministry,
 * but holds no qualification at all. Anything that lets her through is an eligibility
 * bug, not a styling one.
 */

// The volunteer-pool rail abbreviates via formatVolunteerName (FR-013) —
// "First L." — while the assignment chip shows the full name. Both forms are
// asserted where each appears (see us4-schedule-publish.spec.ts). These match
// the recipe's pool names (journey.pool.*.name).
const UNQUALIFIED_SHORT_NAME = 'Ursula U.';
const QUALIFIED_SHORT_NAME = 'Grace H.';

test.describe('qualification governs candidacy', () => {
  test('a ministry member with no role qualification is never offered as a candidate', async ({
    page,
  }, testInfo) => {
    const journey = loadAssignQualificationJourney({ testInfo });
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
    // qualified members: Grace, Ada and the Volunteer (an Usher).
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
    const journey = loadAssignQualificationJourney({ testInfo });
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

test.describe('a plain Volunteer', () => {
  test('sees no Scheduling work', async ({ page }, testInfo) => {
    const journey = loadAssignQualificationJourney({ testInfo });
    await signInPersonaPage({ page, persona: journey.personas.volunteer });

    await page.goto('/scheduling');
    await expect(page.getByTestId('scheduling-capability-index')).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText('No Scheduling work is available'),
    ).toBeVisible();
  });
});
