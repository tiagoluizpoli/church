import { expect, type Locator, type Page, test } from '@playwright/test';
import { LEADER_STORAGE_STATE } from '../global-setup';

test.use({ storageState: LEADER_STORAGE_STATE });

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function assertCanonicalCreateEventForm(dialog: Locator): Promise<void> {
  await expect(
    dialog.getByRole('heading', { name: 'New Event' }),
  ).toBeVisible();
  await expect(dialog.getByLabel('Title')).toBeVisible();
  await expect(dialog.getByLabel('Start date')).toBeVisible();
  await expect(dialog.getByLabel('Start hour')).toBeVisible();
  await expect(dialog.getByLabel('Start minute')).toBeVisible();
  await expect(dialog.getByLabel('End date')).toBeVisible();
  await expect(dialog.getByLabel('End hour')).toBeVisible();
  await expect(dialog.getByLabel('End minute')).toBeVisible();
  await expect(dialog.getByRole('radio', { name: /hourly/i })).toBeVisible();
  await expect(dialog.getByRole('radio', { name: /day-based/i })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Create' })).toBeVisible();
}

async function ensureUnlockedCycleSelected(page: Page): Promise<void> {
  if (
    await page.getByRole('button', { name: 'Add manual event' }).isVisible()
  ) {
    return;
  }

  const now = new Date();
  const year = 2200 + (Math.floor(now.getTime() / 1000) % 50);
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));

  await page
    .getByTestId('cycle-name-input')
    .fill(`Single create-event UI check ${now.getTime()}`);
  await page.getByTestId('cycle-start-date-input').fill(toDateString(start));
  await page.getByTestId('cycle-end-date-input').fill(toDateString(end));
  await page.getByTestId('create-cycle-button').click();
  await expect(
    page.getByRole('button', { name: 'Add manual event' }),
  ).toBeVisible();
}

test('exactly one create-event UI is reachable from every entry point (FR-012, SC-004)', async ({
  page,
}) => {
  // Entry point 1: /scheduling index — ministry ad hoc "New Event".
  await page.goto('/scheduling');
  await page.getByRole('button', { name: 'New Event' }).click();
  const ministryDialog = page.getByRole('dialog');
  await assertCanonicalCreateEventForm(ministryDialog);
  await ministryDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(ministryDialog).not.toBeVisible();

  // Entry point 2: /scheduling/planning — cycle manual event, same UI.
  await page.goto('/scheduling/planning');
  await ensureUnlockedCycleSelected(page);
  await page.getByRole('button', { name: 'Add manual event' }).click();
  const planningDialog = page.getByRole('dialog');
  await assertCanonicalCreateEventForm(planningDialog);
  await planningDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(planningDialog).not.toBeVisible();

  // No second, structurally different create-event form exists anywhere
  // reachable from either surface.
  await expect(page.getByTestId('planning-event-title-input')).toHaveCount(0);
  await expect(page.getByTestId('create-planning-event-button')).toHaveCount(0);
});
