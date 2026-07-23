import { expect, type Locator, type Page, test } from '@playwright/test';
import { LEADER_STORAGE_STATE } from '../global-setup';
import { fillDatePickerField } from './date-picker.helpers';

test.use({ storageState: LEADER_STORAGE_STATE });

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function assertCanonicalCreateEventForm(dialog: Locator): Promise<void> {
  await expect(
    dialog.getByRole('heading', { name: 'New Event' }),
  ).toBeVisible();
  await expect(dialog.getByLabel('Title')).toBeVisible();
  await expect(dialog.getByRole('radio', { name: /hourly/i })).toBeVisible();
  await expect(dialog.getByRole('radio', { name: /day-based/i })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Create' })).toBeVisible();

  // Hourly (default): a single date, no time fields — slots own the time.
  await expect(dialog.getByLabel('Date')).toBeVisible();

  // Day-based: a start/end date range instead.
  await dialog.getByRole('radio', { name: /day-based/i }).click();
  await expect(dialog.getByLabel('Start date')).toBeVisible();
  await expect(dialog.getByLabel('End date')).toBeVisible();
  await dialog.getByRole('radio', { name: /hourly/i }).click();
}

async function ensureUnlockedCycleSelected(page: Page): Promise<void> {
  if (await page.getByRole('button', { name: 'Add event' }).isVisible()) {
    return;
  }

  const now = new Date();
  const year = 2200 + (Math.floor(now.getTime() / 1000) % 50);
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));

  // `.click()` auto-waits for the button to become actionable — the route's
  // `beforeLoad` guard (Phase 8) now awaits a network fetch before the page
  // renders, so a non-waiting `isVisible()` snapshot here would race it.
  await page.getByTestId('open-create-cycle-dialog-button').click();

  await page
    .getByTestId('cycle-name-input')
    .fill(`Single create-event UI check ${now.getTime()}`);
  await fillDatePickerField({
    page,
    trigger: page.getByTestId('cycle-start-date-input'),
    date: toDateString(start),
  });
  await fillDatePickerField({
    page,
    trigger: page.getByTestId('cycle-end-date-input'),
    date: toDateString(end),
  });
  await page.getByTestId('create-cycle-button').click();
  await expect(page.getByRole('button', { name: 'Add event' })).toBeVisible();
}

test('exactly one create-event UI is reachable from every entry point (FR-012, SC-004)', async ({
  page,
}) => {
  // Entry point 1: /scheduling. The nav restructure (FR-015/FR-016) turned this
  // into a redirect, which is itself how FR-012 is now satisfied — there is no
  // separate ministry ad-hoc create-event surface to diverge from the canonical
  // one. Asserting the redirect keeps that guarantee under test: the day
  // someone reintroduces a second surface here, this fails.
  await page.goto('/scheduling');
  await expect(page).toHaveURL(/\/scheduling\/planning-cycles/);

  // Entry point 2: the planning cycle itself — the one canonical form.
  await ensureUnlockedCycleSelected(page);
  await page.getByRole('button', { name: 'Add event' }).click();
  const planningDialog = page.getByRole('dialog');
  await assertCanonicalCreateEventForm(planningDialog);
  await planningDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(planningDialog).not.toBeVisible();

  // No second, structurally different create-event form exists anywhere
  // reachable from either surface.
  await expect(page.getByTestId('planning-event-title-input')).toHaveCount(0);
  await expect(page.getByTestId('create-planning-event-button')).toHaveCount(0);
});
