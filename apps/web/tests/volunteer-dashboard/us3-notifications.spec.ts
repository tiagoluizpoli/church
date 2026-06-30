import { expect, test } from '@playwright/test';
import { LEADER_STORAGE_STATE } from '../global-setup';

test.use({ storageState: LEADER_STORAGE_STATE });

const DASHBOARD_URL = '/dashboard?section=notifications';

test('US3: volunteer reviews inbox history and opens related context', async ({
  page,
}) => {
  await page.goto(DASHBOARD_URL);

  await expect(
    page.getByText('Notifications Inbox', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Mark all as read' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Open notification' }).first().click();

  await expect(
    page.getByRole('button', { name: /Open .*|Back to inbox/ }),
  ).toBeVisible();
});
