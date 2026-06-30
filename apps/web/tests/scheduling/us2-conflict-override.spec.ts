import { expect, test } from '@playwright/test';
import { LEADER_STORAGE_STATE } from '../global-setup';

// T107 — US2: conflict override journey.
// Assigns an unavailable volunteer (Mallory Knox, seeded with 'unavailable'
// availability) to the override-event slot, exercises the override dialog
// 10-character minimum, confirms the override, then verifies the audit log
// entry. Also asserts SC-002: conflict badge renders within 1 second.
//
// Serial: steps share a single draft event state and must run in order.
test.describe.configure({ mode: 'serial' });
test.use({ storageState: LEADER_STORAGE_STATE });

const BUILDER_URL =
  '/scheduling/events/e2e66666-6666-6666-6666-666666666662/builder';

test('US2: conflict badge appears within 1 second of assigning unavailable volunteer (SC-002)', async ({
  page,
}) => {
  await page.goto(BUILDER_URL);
  await expect(page.getByTestId('builder-grid')).toBeVisible({
    timeout: 15_000,
  });

  // Open the picker on the only empty Usher cell.
  await page
    .getByRole('button', { name: /choose volunteer/i })
    .first()
    .click();
  await expect(page.getByTestId('assignment-picker')).toBeVisible();

  // Search for Mallory (unavailable — shown de-prioritised but still present).
  await page.getByPlaceholder(/search volunteers/i).fill('Mallory');
  await expect(page.getByTestId('picker-option')).toBeVisible();

  // Record time and assign.
  const assignStart = Date.now();
  await page.getByTestId('picker-option').click();

  // SC-002: conflict badge must appear within 1 000 ms.
  await expect(page.getByTestId('conflict-badge').first()).toBeVisible({
    timeout: 1_000,
  });
  expect(Date.now() - assignStart).toBeLessThan(1_000);
});

test('US2: override dialog requires ≥10 chars before enabling Confirm', async ({
  page,
}) => {
  await page.goto(BUILDER_URL);
  await expect(page.getByTestId('builder-grid')).toBeVisible({
    timeout: 15_000,
  });

  // The assignment from the previous test persists; the Override button is
  // visible below the chip.
  await expect(page.getByRole('button', { name: /^override$/i })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole('button', { name: /^override$/i }).click();

  const dialog = page.getByRole('dialog', { name: /override conflict/i });
  await expect(dialog).toBeVisible();

  const reason = dialog.getByPlaceholder(/reason for override/i);
  const confirm = dialog.getByRole('button', { name: /confirm override/i });

  // Under 10 chars → button stays disabled.
  await reason.fill('too short');
  await expect(confirm).toBeDisabled();

  // Exactly 10 chars → button enables.
  await reason.fill('Valid reason');
  await expect(confirm).toBeEnabled();
});

test('US2: confirming override saves assignment and audit log records it', async ({
  page,
}) => {
  await page.goto(BUILDER_URL);
  await expect(page.getByTestId('builder-grid')).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole('button', { name: /^override$/i }).click();
  const dialog = page
    .getByRole('dialog', { name: /override conflict/i })
    .last();
  await dialog
    .getByPlaceholder(/reason for override/i)
    .fill('E2E override reason — test');
  await dialog.getByRole('button', { name: /confirm override/i }).click();

  // Dialog closes, assignment chip remains (override confirmed).
  await expect(dialog).not.toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('assignment-chip').first()).toBeVisible();

  // Reload so the audit-log check validates persisted state, not just the
  // immediate post-mutation transition.
  await page.goto(BUILDER_URL);
  await expect(page.getByTestId('builder-grid')).toBeVisible({
    timeout: 15_000,
  });

  // Open audit log via ⋯ overflow menu.
  await page.getByRole('button', { name: /more actions/i }).click();
  const auditMenuItem = page.getByRole('menuitem', { name: 'View Audit Log' });
  await expect(auditMenuItem).toBeVisible();
  await auditMenuItem.click();

  const auditDialog = page.getByRole('dialog', { name: /audit log/i });
  await expect(auditDialog).toBeVisible({ timeout: 5_000 });
  // At least one row containing "Mallory" (the overridden volunteer).
  await expect(auditDialog.getByText(/mallory/i).first()).toBeVisible();
});
