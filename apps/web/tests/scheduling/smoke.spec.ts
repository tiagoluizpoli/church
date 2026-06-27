import { expect, test } from '@playwright/test';
import { LEADER_STORAGE_STATE } from '../global-setup';

// T123 — Full system smoke: the seeded builder renders all key regions for an
// authenticated leader.
test.use({ storageState: LEADER_STORAGE_STATE });

const BUILDER_URL =
  '/scheduling/events/e2e66666-6666-6666-6666-666666666661/builder';

test('builder renders grid, pool, slot row, and publish control', async ({
  page,
}) => {
  await page.goto(BUILDER_URL);

  await expect(page.getByTestId('builder-grid')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId('volunteer-pool')).toBeVisible();
  await expect(page.getByTestId('slot-row').first()).toBeVisible();
  await expect(page.getByTestId('staffing-meter-event')).toBeVisible();
  await expect(page.getByRole('button', { name: /publish/i })).toBeVisible();
});

test('event list lets a leader reach the builder', async ({ page }) => {
  await page.goto('/scheduling');
  await expect(page.getByRole('button', { name: /new event/i })).toBeEnabled();
  await page.getByText('E2E Sunday Service').click();
  await expect(page.getByTestId('builder-grid')).toBeVisible({
    timeout: 15_000,
  });
});
