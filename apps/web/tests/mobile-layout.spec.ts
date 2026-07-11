import { expect, test } from '@playwright/test';
import { VOLUNTEER_STORAGE_STATE } from './global-setup';

// Routes that actually exist for a Volunteer-only caller post-redesign
// (FR-001) — anything else in the bottom nav or drawer is a dead link.
const VOLUNTEER_ALLOWED_HREFS = ['/dashboard', '/availability'];

test.describe('Mobile Responsive Navigation', () => {
  // Viewport, touch, and UA come from the `mobile-chromium` project
  // (devices['iPhone 12']) — see playwright.config.ts.
  test.use({ storageState: VOLUNTEER_STORAGE_STATE });

  test('should display mobile shell, check touch targets, and trigger drawer', async ({
    page,
  }) => {
    await page.goto('/');

    const sidebar = page.getByTestId('sidebar');
    const bottomNav = page.getByTestId('mobile-bottom-nav');
    const topHeader = page.getByTestId('mobile-top-header');
    const drawerTrigger = page.getByTestId('mobile-drawer-trigger');

    // 1. Verify responsive visibility
    await expect(sidebar).not.toBeVisible();
    await expect(bottomNav).toBeVisible();
    await expect(topHeader).toBeVisible();
    await expect(drawerTrigger).toBeVisible();

    // 2. Role-scoped nav: a Volunteer sees exactly Dashboard + Availability,
    // and every bottom-nav link targets a route that actually exists.
    const navLinks = page.locator('[data-testid="mobile-bottom-nav"] a');
    const count = await navLinks.count();
    await expect(navLinks).toHaveText(['Dashboard', 'Availability']);

    for (let i = 0; i < count; i++) {
      const href = await navLinks.nth(i).getAttribute('href');
      expect(VOLUNTEER_ALLOWED_HREFS).toContain(href);
    }

    for (let i = 0; i < count; i++) {
      const box = await navLinks.nth(i).boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }

    // 3. Open drawer
    await drawerTrigger.click();

    // Verify Vaul drawer is open and visible
    const drawerContent = page.getByTestId('mobile-drawer-content');
    await expect(drawerContent).toBeVisible();

    // Check touch target of a link inside the drawer
    const drawerLinks = page.locator('[data-testid="mobile-drawer-content"] a');
    const drawerLinkCount = await drawerLinks.count();
    for (let i = 0; i < drawerLinkCount; i++) {
      const href = await drawerLinks.nth(i).getAttribute('href');
      expect(VOLUNTEER_ALLOWED_HREFS).toContain(href);
    }
    if (drawerLinkCount > 0) {
      const firstLinkBox = await drawerLinks.first().boundingBox();
      expect(firstLinkBox).not.toBeNull();
      if (firstLinkBox) {
        expect(firstLinkBox.width).toBeGreaterThanOrEqual(44);
        expect(firstLinkBox.height).toBeGreaterThanOrEqual(44);
      }
    }
  });
});
