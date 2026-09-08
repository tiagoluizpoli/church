import { expect, test } from '@playwright/test';
import { VOLUNTEER_STORAGE_STATE } from '../global-setup';

test.use({ storageState: VOLUNTEER_STORAGE_STATE });

test('US5: volunteer keeps cached dashboard data readable across all three tabs after reloading offline', async ({
  page,
}) => {
  await page.goto('/dashboard');

  await expect(
    page.getByText('My Upcoming Assignments', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('E2E Care Gathering').first()).toBeVisible();

  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => false,
    });
  });
  await page.route('**/api/v1/volunteer/**', (route) => route.abort());
  await page.reload();

  await expect(page.getByText('Offline mode', { exact: true })).toBeVisible();
  await expect(page.getByText('E2E Care Gathering').first()).toBeVisible();

  await page.getByRole('button', { name: 'Refresh dashboard' }).click();
  await expect(
    page.getByText(
      'Refresh failed while offline. Last-known dashboard data is still available.',
    ),
  ).toBeVisible();

  await page.getByRole('tab', { name: 'Ministry Schedule' }).click();
  await expect(page.getByText('E2E Care Gathering').first()).toBeVisible();

  await page.getByRole('tab', { name: /Availability Needed/i }).click();
  await expect(page.getByText('E2E Sunday Service').first()).toBeVisible();
  await page
    .getByRole('button', { name: 'Open availability editor' })
    .first()
    .click();
  await expect(
    page.getByRole('button', { name: 'Save availability' }),
  ).toBeDisabled();
});
