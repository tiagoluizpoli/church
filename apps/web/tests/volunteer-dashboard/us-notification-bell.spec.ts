import { expect, test } from '@playwright/test';
import { VOLUNTEER_STORAGE_STATE } from '../global-setup';

test.use({ storageState: VOLUNTEER_STORAGE_STATE });

test('US2: bell shows unread count, opens dropdown, deep-links, and views full history', async ({
  page,
}) => {
  await page.goto('/dashboard');

  const bellTrigger = page.getByRole('button', { name: 'Notifications' });
  await expect(bellTrigger).toBeVisible();

  // Other e2e specs share this volunteer fixture and may add their own
  // notifications, so assert "at least one unread" rather than an exact
  // count.
  const badgeText = await bellTrigger
    .locator('[data-slot="badge"]')
    .innerText();
  expect(Number(badgeText)).toBeGreaterThanOrEqual(1);

  await expect(
    page.getByText('Notifications Inbox', { exact: true }),
  ).toHaveCount(0);

  await bellTrigger.click();
  await expect(
    page.getByText('Assignment removed', { exact: true }),
  ).toBeVisible();

  const viewAllLink = page.getByRole('link', { name: 'View all' });
  await expect(viewAllLink).toHaveAttribute('href', '/notifications');

  await page.getByText('Assignment removed', { exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\?.*section=assignments/);

  await page.goto('/notifications');
  await expect(
    page.getByRole('button', { name: 'Mark all as read' }),
  ).toBeVisible();
  await expect(
    page.getByText('Assignment removed', { exact: true }),
  ).toBeVisible();
});
