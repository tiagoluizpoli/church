import { expect, test } from '@playwright/test';
import { LEADER_STORAGE_STATE } from '../global-setup';

test.use({ storageState: LEADER_STORAGE_STATE });

const DASHBOARD_URL =
  '/dashboard?section=availability&eventId=e2e66666-6666-6666-6666-666666666661';

test('US1: volunteer finds availability task and opens event editor within 10 seconds', async ({
  page,
}) => {
  const startedAt = Date.now();

  await page.goto(DASHBOARD_URL);

  await expect(
    page.getByText('Availability needed', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('E2E Sunday Service', { exact: true }).first(),
  ).toBeVisible();

  const elapsedMs = Date.now() - startedAt;
  expect(elapsedMs).toBeLessThan(10_000);

  await expect(
    page.getByText('Availability editor', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('E2E Sunday Service', { exact: true }).last(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Save availability' }),
  ).toBeDisabled();
});
