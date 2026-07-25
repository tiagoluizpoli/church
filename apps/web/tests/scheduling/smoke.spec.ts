import { expect, test } from '@playwright/test';
import { LEADER_STORAGE_STATE } from '../global-setup';

// T123 — Full system smoke: the seeded cycle board renders its key regions for
// an authenticated leader.
test.use({
  storageState: LEADER_STORAGE_STATE,
  viewport: { width: 375, height: 812 },
});

const MINISTRY_ID = 'e2e33333-3333-3333-3333-333333333331';
const PLANNING_CYCLE_ID = 'e2e21111-1111-1111-1111-111111111111';
const WORSHIP_PARTICIPATION_ID = 'e2e61111-1111-1111-1111-111111111114';
const BUILDER_URL = `/scheduling/rostering/${MINISTRY_ID}/${PLANNING_CYCLE_ID}`;

test('builder renders the cycle board, volunteer rail, and publish control', async ({
  page,
}) => {
  await page.goto(BUILDER_URL);

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

  await page.getByRole('button', { name: /^Show only .*\b28\b/i }).click();
  await expect(
    page.getByTestId(
      'cycle-requirement-e2e71111-1111-1111-1111-111111111114-e2e55555-5555-5555-5555-555555555552',
    ),
  ).toBeVisible();
});

test('tailoring lets a leader reach the cycle builder', async ({ page }) => {
  // Deep-link to the seeded cycle rather than picking the first row on
  // /scheduling/tailoring. Other specs legitimately create their own cycles in
  // this church, so "the first cycle" is whatever ran earlier — this test used
  // to pass alone and fail in the full suite for that reason alone.
  await page.goto(`/scheduling/tailoring/${MINISTRY_ID}/${PLANNING_CYCLE_ID}`);

  // The cycle's own roster link; both it and the older "Assign" link on the
  // cycle list resolve to the same rostering URL.
  await page
    .getByTestId(`open-roster-link-${WORSHIP_PARTICIPATION_ID}`)
    .click();
  await expect(page.getByTestId('cycle-builder')).toBeVisible({
    timeout: 15_000,
  });
});

test('a draft assignment persists through publish and can be reassigned', async ({
  page,
}) => {
  const firstRequirement = page.getByTestId(
    'cycle-requirement-e2e71111-1111-1111-1111-111111111111-e2e55555-5555-5555-5555-555555555551',
  );
  const requirement = page.getByTestId(
    'cycle-requirement-e2e71111-1111-1111-1111-111111111114-e2e55555-5555-5555-5555-555555555552',
  );

  await page.goto(BUILDER_URL);
  await page.getByRole('button', { name: /^Show only .*\b25\b/i }).click();
  await expect(firstRequirement).toBeVisible();
  await firstRequirement.getByRole('button', { name: 'Add' }).first().click();
  await page
    .getByTestId('assignment-picker')
    .getByTestId('picker-option')
    .first()
    .click();
  await expect(firstRequirement.getByTestId('assignment-chip')).toBeVisible();

  await page.getByRole('button', { name: /^Show only .*\b28\b/i }).click();
  await expect(requirement).toBeVisible();

  await requirement.getByRole('button', { name: 'Add' }).first().click();
  const picker = page.getByTestId('assignment-picker');
  await expect(picker).toBeVisible();
  await picker.getByTestId('picker-option').first().click();
  await expect(requirement.getByTestId('assignment-chip')).toBeVisible();

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
