import { expect, test } from '@playwright/test';
import { LEADER_STORAGE_STATE } from './global-setup';

test.describe('Timezone Policy', () => {
  // Emulate a user in London (UTC+1 in May)
  test.use({ timezoneId: 'Europe/London' });
  test.use({ storageState: LEADER_STORAGE_STATE });

  // NOTE: This test verifies the Church Time / Local Time toggle state only.
  // Event-row date-format assertions were removed when the home EventList
  // moved from mock data to real tRPC data. Restoring deterministic
  // date-format coverage requires an authenticated, seeded event at `/`,
  // which depends on the e2e auth + seed fixtures tracked in T126.
  test('should toggle between Church Time and Local Time', async ({ page }) => {
    await page.goto('/');

    // Open user menu dropdown
    await page.getByRole('button', { name: /Account menu for/ }).click();

    const toggleButton = page.getByRole('button', {
      name: /Church Time|Local Time/,
    });

    // Initial state: Church Time (America/New_York is configured in main.tsx)
    await expect(toggleButton).toContainText('Church Time');

    // Toggle to Local Time (London)
    await toggleButton.click();
    await expect(toggleButton).toContainText('Local Time');

    // Toggle back to Church Time
    await toggleButton.click();
    await expect(toggleButton).toContainText('Church Time');
  });
});

test.describe('Timezone toggle placement (021)', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test.use({ storageState: LEADER_STORAGE_STATE });

  // The desktop user-menu dropdown's "Church time" item (021 FR) only
  // renders at `md:` and up — below that it lives directly in the mobile
  // nav drawer body as its own always-visible toggle (see
  // planning-cycles-table-view.spec.ts's mobile timezone spec), separate
  // from the user-menu dropdown. Guards the `isDesktop` branch in
  // `user-menu.tsx` from silently reappearing on mobile. `UserMenu` is
  // mounted twice in app-shell.tsx (desktop topbar, `hidden md:flex`;
  // mobile nav drawer) so this opens the drawer and scopes to its
  // `UserMenu` instance to avoid a strict-mode match on both — and the
  // final assertion scopes to the opened dropdown menu itself (`role=
  // "menu"`), not the page, since the drawer's own separate toggle button
  // is still on the page underneath.
  test('user-menu dropdown has no Church/Local Time toggle on mobile', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('mobile-drawer-trigger').click();
    const drawerContent = page.getByTestId('mobile-drawer-content');
    await expect(drawerContent).toBeVisible();
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
