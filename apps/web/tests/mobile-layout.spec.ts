import { expect, test } from '@playwright/test';

test.describe('Mobile Responsive Navigation', () => {
  // Enforce mobile viewport
  test.use({ viewport: { width: 390, height: 800 } });

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

    // 2. Check touch targets on bottom nav links
    const navLinks = page.locator('[data-testid="mobile-bottom-nav"] a');
    const count = await navLinks.count();
    expect(count).toBeGreaterThanOrEqual(4); // Dashboard, Shifts, Alerts, Profile

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
