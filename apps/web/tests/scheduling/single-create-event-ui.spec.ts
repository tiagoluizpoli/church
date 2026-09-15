import { expect, type Locator, type Page, test } from '@playwright/test';
import { LEADER_STORAGE_STATE } from '../global-setup';
import { fillDatePickerField } from './date-picker.helpers';

test.use({ storageState: LEADER_STORAGE_STATE });

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Mirrors `useTimezone().format(date, 'PP')`, which every event display
 * renders through — assertions against `planning-events-list` must match its
 * human-readable output, not the `YYYY-MM-DD` the day was picked with. */
function toDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    year: 'numeric',
  });
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

test.describe('quick-create stores church-local Instants (#149)', () => {
  // churchA (this fixture's church) is America/Sao_Paulo (UTC-3); a browser
  // far ahead of it (UTC+13) would show the wrong calendar day if the modal
  // ever went back to stamping literal UTC midnight.
  test.use({ timezoneId: 'Pacific/Auckland' });

  test('the created Event appears on the picked CalendarDay in the Church Timezone', async ({
    page,
  }) => {
    await page.goto('/scheduling/planning-cycles');

    const now = new Date();
    const year = 2200 + (Math.floor(now.getTime() / 1000) % 50);
    // A month distinct from `ensureUnlockedCycleSelected`'s, so this test's
    // own cycle can never overlap one created elsewhere in this spec file.
    const month = (now.getUTCMonth() + 3) % 12;
    const start = new Date(Date.UTC(year, month, 1));
    const end = new Date(Date.UTC(year, month + 1, 1));
    const pickedDate = toDateString(new Date(Date.UTC(year, month, 15)));

    await page.getByTestId('open-create-cycle-dialog-button').click();
    await page
      .getByTestId('cycle-name-input')
      .fill(`Church TZ boundary check ${now.getTime()}`);
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

    await page.getByRole('button', { name: 'Add event' }).click();
    const dialog = page.getByRole('dialog');
    const title = `Church TZ event ${now.getTime()}`;
    await dialog.getByLabel('Title').fill(title);
    await fillDatePickerField({
      page,
      trigger: dialog.getByLabel('Date'),
      date: pickedDate,
    });
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog).not.toBeVisible();

    await expect(page.getByTestId('planning-events-list')).toContainText(title);
    await expect(page.getByTestId('planning-events-list')).toContainText(
      toDisplayDate(pickedDate),
    );
  });
});
