import { expect, test } from '@playwright/test';
import { LEADER_STORAGE_STATE } from '../global-setup';

test.use({ storageState: LEADER_STORAGE_STATE });

const DASHBOARD_URL = '/dashboard?section=ministry_schedule';

test('US4: volunteer browses ministry schedule and switches ministries when available', async ({
  page,
}) => {
  await page.goto(DASHBOARD_URL);

  await expect(
    page.getByRole('tab', { name: 'Ministry Schedule' }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByText(
      'Browse published schedule rows without leader-only conflict or audit details.',
      { exact: true },
    ),
  ).toBeVisible();

  const ministrySelector = page.getByRole('combobox', {
    name: 'Select ministry',
  });

  await expect(ministrySelector).toBeVisible();
  await ministrySelector.click();
  await page.getByRole('option', { name: 'E2E Care' }).click();

  await page
    .getByRole('button', { name: 'Show schedule for E2E Care Gathering' })
    .click();

  await expect(page.getByText('Care Host').first()).toBeVisible();
  await expect(page.getByText('Volunteer: E2E L.')).toBeVisible();
  await expect(page.getByText('Team: Care Team')).toBeVisible();
});
