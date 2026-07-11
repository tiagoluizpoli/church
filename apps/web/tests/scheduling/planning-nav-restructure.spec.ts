import { expect, test } from '@playwright/test';
import { CHURCH_ADMIN_STORAGE_STATE } from '../global-setup';
import { fillDatePickerField } from './date-picker.helpers';

test.use({ storageState: CHURCH_ADMIN_STORAGE_STATE });

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

test('planning-cycles, new, and $cycleId are distinct addressable URLs with working back/forward (FR-015, FR-016, SC-007)', async ({
  page,
}) => {
  const now = new Date();
  const year = 2300 + (Math.floor(now.getTime() / 1000) % 50);
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  const cycleName = `Nav restructure check ${year}-${String(month + 1).padStart(2, '0')} ${now.getTime()}`;

  await page.goto('/scheduling/planning-cycles');
  await expect(page).toHaveURL(/\/scheduling\/planning-cycles\/?$/);
  await expect(page.getByText('Existing cycles')).toBeVisible();

  await page.getByTestId('open-create-cycle-dialog-button').click();
  await expect(page).toHaveURL('/scheduling/planning-cycles/new');
  const createCycleDialog = page.getByRole('dialog', { name: 'Create cycle' });
  await createCycleDialog.getByTestId('cycle-name-input').fill(cycleName);
  await fillDatePickerField({
    page,
    trigger: createCycleDialog.getByTestId('cycle-start-date-input'),
    date: toDateString(start),
  });
  await fillDatePickerField({
    page,
    trigger: createCycleDialog.getByTestId('cycle-end-date-input'),
    date: toDateString(end),
  });
  await createCycleDialog.getByTestId('create-cycle-button').click();

  await expect(page.getByTestId('selected-cycle-name')).toHaveText(cycleName);
  await expect(page).toHaveURL(
    /\/scheduling\/planning-cycles\/(?!new$)(?!templates$)[^/]+$/,
  );
  const cycleReviewUrl = page.url();

  // Opening the template library from a selected cycle changes the URL too
  // (previously `activeView` component state only).
  await page.getByTestId('open-template-library-button').click();
  await expect(page).toHaveURL(/\/scheduling\/planning-cycles\/templates\?/);
  await expect(page.getByText('Saved templates')).toBeVisible();

  // Back/forward retrace: templates -> cycle review -> new -> index.
  await page.goBack();
  await expect(page).toHaveURL(cycleReviewUrl);
  await expect(page.getByTestId('selected-cycle-name')).toHaveText(cycleName);

  await page.goBack();
  await expect(page).toHaveURL('/scheduling/planning-cycles/new');

  await page.goBack();
  await expect(page).toHaveURL(/\/scheduling\/planning-cycles\/?$/);

  await page.goForward();
  await expect(page).toHaveURL('/scheduling/planning-cycles/new');

  await page.goForward();
  await expect(page).toHaveURL(cycleReviewUrl);
  await expect(page.getByTestId('selected-cycle-name')).toHaveText(cycleName);
});
