import { expect, test } from '@playwright/test';
import { LEADER_STORAGE_STATE } from '../global-setup';

// T110 — US3: volunteer decline flow.
// The e2e-seed pre-seeds Grace Hopper's assignment on the decline event with
// status='declined'. This spec verifies the builder shows the × badge, opens
// substitution mode on click (with Grace pinned), and replaces her with Ada.
//
// Serial: steps share one published event state and run in order.
test.describe.configure({ mode: 'serial' });
test.use({ storageState: LEADER_STORAGE_STATE });

const BUILDER_URL =
  '/scheduling/events/e2e66666-6666-6666-6666-666666666663/builder';

test('US3: declined cell shows × badge', async ({ page }) => {
  await page.goto(BUILDER_URL);
  await expect(page.getByTestId('builder-grid')).toBeVisible({
    timeout: 15_000,
  });

  // The declined assignment chip shows a confirmation badge with ×.
  const chip = page.getByTestId('assignment-chip').first();
  await expect(chip).toBeVisible();
  await expect(
    chip.getByTestId('confirmation-badge').getByLabel('declined'),
  ).toBeVisible();
});

test('US3: clicking declined cell opens substitution picker with declined volunteer pinned', async ({
  page,
}) => {
  await page.goto(BUILDER_URL);
  await expect(page.getByTestId('builder-grid')).toBeVisible({
    timeout: 15_000,
  });

  // Click the declined chip → opens substitution mode (not the regular picker).
  await page.getByTestId('assignment-chip').first().click();

  // The pinned "declined" row identifies Grace Hopper.
  const pinned = page.getByTestId('declined-pinned');
  await expect(pinned).toBeVisible({ timeout: 5_000 });
  await expect(pinned).toContainText(/grace/i);
});

test('US3: selecting replacement volunteer fills the cell', async ({
  page,
}) => {
  await page.goto(BUILDER_URL);
  await expect(page.getByTestId('builder-grid')).toBeVisible({
    timeout: 15_000,
  });

  await page.getByTestId('assignment-chip').first().click();
  await expect(page.getByTestId('declined-pinned')).toBeVisible({
    timeout: 5_000,
  });

  // Pick Ada Lovelace as the replacement (available, appears in picker list).
  const dialog = page.getByRole('dialog', {
    name: /find replacement for grace h\./i,
  });
  await dialog.getByPlaceholder(/search available volunteers/i).fill('Ada');
  await expect(
    dialog.getByRole('button', { name: /ada l\. available/i }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: /ada l\. available/i }).click();

  // The substituted grid now includes Ada and no longer shows Grace in a cell.
  const grid = page.getByTestId('builder-grid');
  await expect(
    grid.getByTestId('assignment-chip').filter({ hasText: /ada/i }),
  ).toHaveCount(1);
  await expect(
    grid.getByTestId('assignment-chip').filter({ hasText: /grace/i }),
  ).toHaveCount(0);
});
