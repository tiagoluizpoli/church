import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { loadAssignBoardJourney } from '@/tests/fixtures/journeys/assign-board';
import {
  assignBuilderPath,
  requirementCellTestId,
  signInPersonaPage,
} from '@/tests/fixtures/journeys/assign-church';

// T124 — Accessibility smoke. The journey's own cycle board (assign-board
// recipe): opening the builder can write (it creates any missing
// Participation), so the scan runs on journey-owned data. Its assigned
// service holds a pending, a confirmed and a declined Host; the board shows
// the two active ones as chips, which the scan then covers.
test('schedule builder has no critical or serious WCAG violations', async ({
  page,
}, testInfo) => {
  const journey = loadAssignBoardJourney({ testInfo });
  await signInPersonaPage({ page, persona: journey.personas.leader });

  await page.goto(
    assignBuilderPath({
      ministryId: journey.ministries.worship.id,
      cycleId: journey.cycle.id,
    }),
  );
  await expect(page.getByTestId('cycle-builder')).toBeVisible({
    timeout: 15_000,
  });
  const { assignedService } = journey.events;
  const assignedChips = page
    .getByTestId(
      requirementCellTestId({
        shiftId: assignedService.shiftId,
        roleId: assignedService.requirements.host.roleId,
      }),
    )
    .getByTestId('assignment-chip');
  await expect(assignedChips).toHaveCount(2);
  await expect(assignedChips.first()).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  const blocking = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  expect(
    blocking,
    `a11y violations: ${blocking.map((v) => v.id).join(', ')}`,
  ).toEqual([]);
});
