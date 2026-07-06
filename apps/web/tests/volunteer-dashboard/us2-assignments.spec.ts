import { expect, test } from '@playwright/test';
import { LEADER_STORAGE_STATE } from '../global-setup';

test.use({ storageState: LEADER_STORAGE_STATE });

const DASHBOARD_URL = '/dashboard?section=assignments';

test('US2: volunteer reviews a pending assignment group and responds within 30 seconds', async ({
  page,
}) => {
  const startedAt = Date.now();

  await page.goto(DASHBOARD_URL);

  await expect(
    page.getByRole('tab', { name: 'Upcoming Assignments' }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByText('My Upcoming Assignments', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Hide assignments for/i }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'I cannot serve' }).first().click();
  await expect(
    page.getByText('Confirm unable-to-serve notice', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Type the confirmation phrase').fill('I cannot serve');
  await page.getByRole('button', { name: 'Confirm I cannot serve' }).click();

  await expect(
    page.getByText('Leader notified that you cannot serve.', { exact: true }),
  ).toBeVisible();

  const elapsedMs = Date.now() - startedAt;
  expect(elapsedMs).toBeLessThan(30_000);
});
