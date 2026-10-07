import { expect, test } from '@playwright/test';
import {
  loadRosteringBoardJourney,
  type RosteringBoardJourney,
} from '../fixtures/journeys/rostering-board';
import {
  dayFilterName,
  requirementCellTestId,
  rosteringTailoringPath,
  signInPersonaPage,
  worshipBuilderPath,
} from '../fixtures/journeys/rostering-church';

// T123 — Full system smoke: the journey's own cycle board (rostering-board
// recipe) renders its key regions for an authenticated leader.
test.use({ viewport: { width: 375, height: 812 } });

interface JourneyInput {
  journey: RosteringBoardJourney;
}

/** The team service's Team Alpha Greeter seat. */
function teamGreeterCellTestId({ journey }: JourneyInput): string {
  const { teamService } = journey.events;
  return requirementCellTestId({
    shiftId: teamService.shiftId,
    roleId: teamService.requirements.greeter.roleId,
  });
}

test('builder renders the cycle board, volunteer rail, and publish control', async ({
  page,
}, testInfo) => {
  const journey = loadRosteringBoardJourney({ testInfo });
  await signInPersonaPage({ page, persona: journey.personas.leader });

  await page.goto(worshipBuilderPath({ journey }));

  await expect(page.getByTestId('cycle-builder')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId('volunteer-pool')).toBeVisible();
  await expect(page.getByTestId('cycle-board-scroll')).toBeVisible();
  // The board's per-date staffing readout is the production status indicator.
  await expect(
    page.getByTestId('cycle-date-staffing-percent').first(),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /publish/i })).toBeVisible();
  await expect(page.getByText(/continue on desktop/i)).toHaveCount(0);

  const board = page.getByTestId('cycle-board-scroll');
  const volunteerPool = page.getByTestId('volunteer-pool');
  // The ScrollArea root never scrolls — its viewport does. Measuring the root
  // reported no overflow even though the board is 960px wide inside it.
  expect(
    await page
      .getByTestId('cycle-board-viewport')
      .evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true);
  const boardBox = await board.boundingBox();
  const poolBox = await volunteerPool.boundingBox();
  expect(poolBox?.y).toBeGreaterThan(boardBox?.y ?? 0);

  await page
    .getByRole('button', {
      name: dayFilterName({ day: journey.events.teamService.day }),
    })
    .click();
  await expect(
    page.getByTestId(teamGreeterCellTestId({ journey })),
  ).toBeVisible();
});

test('tailoring lets a leader reach the cycle builder', async ({
  page,
}, testInfo) => {
  const journey = loadRosteringBoardJourney({ testInfo });
  await signInPersonaPage({ page, persona: journey.personas.leader });

  // Deep-link to the journey's own cycle rather than picking a row on
  // /scheduling/tailoring.
  await page.goto(
    rosteringTailoringPath({
      ministryId: journey.ministries.worship.id,
      cycleId: journey.cycle.id,
    }),
  );

  // The cycle's own roster link; both it and the older "Assign" link on the
  // cycle list resolve to the same rostering URL.
  await page
    .getByTestId(
      `open-roster-link-${journey.events.teamService.participationId}`,
    )
    .click();
  await expect(page.getByTestId('cycle-builder')).toBeVisible({
    timeout: 15_000,
  });
});

test('a draft assignment persists through publish and can be reassigned', async ({
  page,
}, testInfo) => {
  const journey = loadRosteringBoardJourney({ testInfo });
  await signInPersonaPage({ page, persona: journey.personas.leader });
  const { service, teamService } = journey.events;

  const firstRequirement = page.getByTestId(
    requirementCellTestId({
      shiftId: service.shiftId,
      roleId: service.requirements.usher.roleId,
    }),
  );
  const requirement = page.getByTestId(teamGreeterCellTestId({ journey }));

  // The journey owns the cycle, and its Usher and Greeter pools are disjoint,
  // so neither pick can collide with an assignment made elsewhere: each seat
  // starts empty and ends with exactly the one chip this test adds.
  await page.goto(worshipBuilderPath({ journey }));
  await page
    .getByRole('button', { name: dayFilterName({ day: service.day }) })
    .click();
  await expect(firstRequirement).toBeVisible();
  await expect(firstRequirement.getByTestId('assignment-chip')).toHaveCount(0);
  await firstRequirement.getByRole('button', { name: 'Add' }).first().click();
  await page
    .getByTestId('assignment-picker')
    .getByTestId('picker-option')
    .first()
    .click();
  await expect(firstRequirement.getByTestId('assignment-chip')).toHaveCount(1);

  await page
    .getByRole('button', { name: dayFilterName({ day: teamService.day }) })
    .click();
  await expect(requirement).toBeVisible();

  await requirement.getByRole('button', { name: 'Add' }).first().click();
  const picker = page.getByTestId('assignment-picker');
  await expect(picker).toBeVisible();
  await picker.getByTestId('picker-option').first().click();
  await expect(requirement.getByTestId('assignment-chip')).toHaveCount(1);

  await page.getByRole('button', { name: 'Publish cycle' }).first().click();
  await page.getByRole('button', { name: 'Publish cycle' }).last().click();
  await expect(page.getByText('Cycle published')).toBeVisible();

  await requirement.getByTestId('assignment-chip').click();
  await expect(picker).toBeVisible();
  const options = picker.getByTestId('picker-option');
  await expect(options.nth(1)).toBeVisible();
  // Read the candidate's name from its own element rather than slicing the
  // option's full text, which also carries availability and workload lines.
  const replacement = await options
    .nth(1)
    .getByTestId('picker-option-name')
    .innerText();
  await options.nth(1).click();
  await expect(requirement.getByTestId('assignment-chip')).toContainText(
    replacement.trim(),
  );

  await page.reload();
  await expect(requirement.getByTestId('assignment-chip')).toBeVisible();
});
