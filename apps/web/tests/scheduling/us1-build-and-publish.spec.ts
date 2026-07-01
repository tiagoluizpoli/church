import { expect, test } from '@playwright/test';
import { LEADER_STORAGE_STATE } from '../global-setup';

// Build journey covering US1 (T103), US4 slot management (T116), and US5
// suggestions (T119). Serial: the steps share one seeded draft event and must
// run in order (slot edits before publish locks the event).
test.describe.configure({ mode: 'serial' });
test.use({ storageState: LEADER_STORAGE_STATE });

const BUILDER_URL =
  '/scheduling/events/e2e66666-6666-6666-6666-666666666661/builder';

test('US5: empty cells show volunteer suggestions', async ({ page }) => {
  await page.goto(BUILDER_URL);
  await expect(page.getByTestId('builder-grid')).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByTestId('builder-grid').getByTestId('suggestion-list').first(),
  ).toBeVisible();
});

test('US4: leader adds a slot', async ({ page }) => {
  await page.goto(BUILDER_URL);
  await expect(page.getByTestId('builder-grid')).toBeVisible({
    timeout: 15_000,
  });
  const before = await page.getByTestId('slot-row').count();

  await page.getByRole('button', { name: /add slot/i }).click();
  await page.getByLabel(/start time hour/i).fill('13');
  await page.getByLabel(/start time minute/i).fill('00');
  await page.getByLabel(/end time hour/i).fill('15');
  await page.getByLabel(/end time minute/i).fill('00');
  await page.getByRole('button', { name: /^save$/i }).click();

  await expect(page.getByTestId('slot-row')).toHaveCount(before + 1, {
    timeout: 10_000,
  });
});

test('SC-006: auto-save status shows "Saved" within 2 seconds of assignment', async ({
  page,
}) => {
  await page.goto(BUILDER_URL);
  await expect(page.getByTestId('builder-grid')).toBeVisible({
    timeout: 15_000,
  });

  const saveStart = Date.now();
  await page
    .getByTestId('builder-grid')
    .getByRole('button', { name: /accept/i })
    .first()
    .click();

  // SC-006: save-status must show 'Saved' within 2 000 ms of the action.
  await expect(
    page.getByTestId('save-status').filter({ hasText: 'Saved' }),
  ).toBeVisible({ timeout: 2_000 });
  expect(Date.now() - saveStart).toBeLessThan(2_000);
});

test('US1: leader assigns a volunteer and publishes', async ({ page }) => {
  await page.goto(BUILDER_URL);
  await expect(page.getByTestId('builder-grid')).toBeVisible({
    timeout: 15_000,
  });

  await page
    .getByTestId('builder-grid')
    .getByRole('button', { name: /accept/i })
    .first()
    .click();
  await expect(page.getByTestId('assignment-chip').first()).toBeVisible({
    timeout: 10_000,
  });

  await page.getByRole('button', { name: /^publish$/i }).click();
  await expect(page.getByText(/published/i).first()).toBeVisible({
    timeout: 10_000,
  });
});
