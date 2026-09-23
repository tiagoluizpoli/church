import { expect, test } from '@playwright/test';
import { MINISTRY_LEADER_STORAGE_STATE } from '../global-setup';

test.use({ storageState: MINISTRY_LEADER_STORAGE_STATE });

test('a Ministry leader sees only their led Ministry workspace', async ({
  page,
}) => {
  await page.goto('/scheduling');

  await expect(
    page.getByRole('link', { name: 'Open E2E Worship' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open church planning' }),
  ).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open E2E Care' })).toHaveCount(
    0,
  );

  await page.getByRole('link', { name: 'Open E2E Worship' }).click();
  await expect(page).toHaveURL(
    '/scheduling/tailoring/e2e33333-3333-3333-a333-333333333331',
  );
});
