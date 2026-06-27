import { expect, test } from '@playwright/test';
import { SUB_LEADER_STORAGE_STATE } from '../global-setup';

// T122 — US6: sub-leader scope enforcement.
// The e2e-seed gives the sub-leader `systemRole='sub_leader'` in team1.
// The US6 event has two slot requirements:
//   • Greeter (teamId=team1) — interactive for sub-leader
//   • Usher  (no teamId)     — visible but read-only for sub-leader
//
// Verifies: sidebar shows only team1 volunteers (Grace Hopper); own-team
// cell is interactive; other-team cell is read-only.
test.use({ storageState: SUB_LEADER_STORAGE_STATE });

const BUILDER_URL =
  '/scheduling/events/e2e66666-6666-6666-6666-666666666664/builder';

test('US6: sidebar shows only team1 volunteers for sub-leader', async ({
  page,
}) => {
  await page.goto(BUILDER_URL);
  await expect(page.getByTestId('builder-grid')).toBeVisible({
    timeout: 15_000,
  });

  const pool = page.getByTestId('volunteer-pool');
  await expect(pool).toBeVisible();

  // Grace Hopper is in team1 — must be visible.
  await expect(pool.getByText(/grace/i)).toBeVisible();

  // Ada Lovelace and Alan Turing are not in team1 — must NOT be visible.
  await expect(pool.getByText(/ada/i)).not.toBeVisible();
  await expect(pool.getByText(/alan/i)).not.toBeVisible();
});

test('US6: own-team Greeter cell is interactive', async ({ page }) => {
  await page.goto(BUILDER_URL);
  await expect(page.getByTestId('builder-grid')).toBeVisible({
    timeout: 15_000,
  });

  // Find the Greeter requirement cell (teamId=team1 → data-readonly="false").
  const interactiveCells = page.getByTestId('requirement-cell').filter({
    has: page.locator('[data-readonly="false"]'),
  });
  // Clicking "Choose volunteer…" in the interactive cell opens the picker.
  await interactiveCells
    .getByRole('button', { name: /choose volunteer/i })
    .first()
    .click();
  await expect(page.getByTestId('assignment-picker')).toBeVisible({
    timeout: 5_000,
  });
  // Close picker.
  await page.keyboard.press('Escape');
});

test('US6: non-team Usher cell is read-only — no picker opens on click', async ({
  page,
}) => {
  await page.goto(BUILDER_URL);
  await expect(page.getByTestId('builder-grid')).toBeVisible({
    timeout: 15_000,
  });

  // The Usher cell has data-readonly="true".
  const readOnlyCell = page
    .getByTestId('requirement-cell')
    .locator('[data-readonly="true"]')
    .first();
  await expect(readOnlyCell).toBeVisible();

  await readOnlyCell.click();

  // Picker must NOT open after clicking a read-only cell.
  await expect(page.getByTestId('assignment-picker')).not.toBeVisible();
});
