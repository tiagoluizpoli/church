import { expect, test } from '@playwright/test';
import { LEADER_STORAGE_STATE } from '../global-setup';

test.use({ storageState: LEADER_STORAGE_STATE });

test('US5: volunteer keeps cached dashboard data after reloading offline', async ({
  page,
}) => {
  await page.goto('/dashboard');

  await expect(
    page.getByText('My Upcoming Assignments', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Notifications Inbox', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open notification' }).first(),
  ).toBeVisible();
  await expect(
    page.getByText('Ministry Schedule', { exact: true }),
  ).toBeVisible();

  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => false,
    });
  });
  await page.route('**/trpc/**', (route) => route.abort());
  await page.reload();

  await expect(page.getByText('Offline mode', { exact: true })).toBeVisible();
  await expect(page.getByText('E2E Sunday Service').first()).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open notification' }).first(),
  ).toBeVisible();
  await expect(page.getByText('E2E Care Gathering').first()).toBeVisible();

  await page.getByRole('button', { name: 'Refresh dashboard' }).click();
  await expect(
    page.getByText(
      'Refresh failed while offline. Last-known dashboard data is still available.',
    ),
  ).toBeVisible();

  await page
    .getByRole('button', { name: 'Open availability editor' })
    .first()
    .click();
  await expect(
    page.getByRole('button', { name: 'Save availability' }),
  ).toBeDisabled();
});
