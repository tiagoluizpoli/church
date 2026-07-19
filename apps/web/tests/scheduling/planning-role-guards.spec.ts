import { expect, test } from '@playwright/test';
import {
  CHURCH_ADMIN_STORAGE_STATE,
  LEADER_STORAGE_STATE,
  VOLUNTEER_STORAGE_STATE,
} from '../global-setup';

test.describe('ChurchAdmin route guard on /scheduling/planning-cycles', () => {
  test.use({ storageState: CHURCH_ADMIN_STORAGE_STATE });

  test('a ChurchAdmin can load /scheduling/planning-cycles', async ({
    page,
  }) => {
    await page.goto('/scheduling/planning-cycles');

    await expect(page).toHaveURL(/\/scheduling\/planning-cycles\/?$/);
    await expect(page.getByTestId('planning-admin-page')).toBeVisible();
  });
});

test.describe('non-ChurchAdmin denial at /scheduling/planning-cycles', () => {
  test.use({ storageState: VOLUNTEER_STORAGE_STATE });

  test('a Volunteer hitting /scheduling/planning-cycles by URL is redirected before the planning page renders (FR-015)', async ({
    page,
  }) => {
    await page.goto('/scheduling/planning-cycles');

    await expect(page).not.toHaveURL(/\/scheduling\/planning-cycles/);
    await expect(page.getByTestId('planning-admin-page')).toHaveCount(0);
  });
});

test.describe('Leader direct access to the other scheduling routes', () => {
  test.use({ storageState: LEADER_STORAGE_STATE });

  test('a Leader can load /scheduling/tailoring and the cycle builder directly', async ({
    page,
  }) => {
    await page.goto('/scheduling/tailoring');
    await expect(page).toHaveURL('/scheduling/tailoring');

    await page.goto(
      '/scheduling/rostering/e2e33333-3333-3333-3333-333333333331/e2e21111-1111-1111-1111-111111111111',
    );
    await expect(page.getByTestId('cycle-builder-board')).toBeVisible();
  });
});
