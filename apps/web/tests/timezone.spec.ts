import { expect, test } from '@playwright/test';
import { LEADER_STORAGE_STATE } from './global-setup';

test.describe('Timezone Policy', () => {
  // Emulate a user in London (UTC+1 in May) — displayed times must still
  // follow the Church Timezone, not the browser's, since there is no
  // viewer's clock in this product (ADR-0003).
  test.use({ timezoneId: 'Europe/London' });
  test.use({ storageState: LEADER_STORAGE_STATE });

  test('no Church/Local Time control renders on desktop or mobile', async ({
    page,
  }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /Account menu for/ }).click();
    await expect(
      page.getByRole('button', { name: /Church Time|Local Time/ }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByTestId('mobile-drawer-trigger').click();
    const drawerContent = page.getByTestId('mobile-drawer-content');
    await expect(drawerContent).toBeVisible();
    await expect(
      drawerContent.getByRole('button', { name: /Church Time|Local Time/ }),
    ).toHaveCount(0);
    await drawerContent
      .getByRole('button', { name: /Account menu for/ })
      .click();
    const accountMenu = page.getByRole('menu');
    await expect(accountMenu).toBeVisible();
    await expect(
      accountMenu.getByRole('button', { name: /Church Time|Local Time/ }),
    ).toHaveCount(0);
  });
});
