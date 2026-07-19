import { expect, test } from '@playwright/test';
import { LEADER_STORAGE_STATE } from '../global-setup';

// T123 — Full system smoke: the seeded cycle board renders its key regions for
// an authenticated leader.
test.use({
  storageState: LEADER_STORAGE_STATE,
  viewport: { width: 375, height: 812 },
});

const BUILDER_URL =
  '/scheduling/rostering/e2e33333-3333-3333-3333-333333333331/e2e21111-1111-1111-1111-111111111111';

test('builder renders the cycle board, volunteer rail, and publish control', async ({
  page,
}) => {
  await page.goto(BUILDER_URL);

  await expect(page.getByTestId('cycle-builder-board')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId('volunteer-pool')).toBeVisible();
  await expect(page.getByTestId('cycle-board-scroll')).toBeVisible();
  await expect(page.getByTestId('staffing-meter-event')).toBeVisible();
  await expect(page.getByRole('button', { name: /publish/i })).toBeVisible();
  await expect(page.getByText(/continue on desktop/i)).toHaveCount(0);

  const board = page.getByTestId('cycle-board-scroll');
  const volunteerPool = page.getByTestId('volunteer-pool');
  expect(
    await board.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(true);
  const boardBox = await board.boundingBox();
  const poolBox = await volunteerPool.boundingBox();
  expect(poolBox?.y).toBeGreaterThan(boardBox?.y ?? 0);

  await page.getByRole('button', { name: /28 de dezembro de 2026/i }).click();
  await expect(
    page.getByTestId(
      'cycle-requirement-e2e71111-1111-1111-1111-111111111114-e2e55555-5555-5555-5555-555555555552',
    ),
  ).toBeVisible();
});

test('tailoring lets a leader reach the cycle builder', async ({ page }) => {
  await page.goto('/scheduling/tailoring');
  await page.getByRole('button', { name: 'View cycles' }).click();
  await page
    .getByTestId(
      'ministry-cycle-assign-link-e2e21111-1111-1111-1111-111111111111',
    )
    .click();
  await expect(page.getByTestId('cycle-builder-board')).toBeVisible({
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
  await page.getByRole('button', { name: /25 de dezembro de 2026/i }).click();
  await expect(firstRequirement).toBeVisible();
  await firstRequirement
    .getByRole('button', { name: 'Assign Usher' })
    .first()
    .click();
  await page
    .getByTestId('assignment-picker')
    .getByTestId('picker-option')
    .first()
    .click();
  await expect(firstRequirement.getByTestId('assignment-chip')).toBeVisible();

  await page.getByRole('button', { name: /28 de dezembro de 2026/i }).click();
  await expect(requirement).toBeVisible();

  await requirement
    .getByRole('button', { name: 'Assign Greeter' })
    .first()
    .click();
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
  const replacement = await options.nth(1).textContent();
  await options.nth(1).click();
  await expect(requirement.getByTestId('assignment-chip')).toContainText(
    replacement?.split('available')[0]?.trim() ?? '',
  );

  await page.reload();
  await expect(requirement.getByTestId('assignment-chip')).toBeVisible();
});
