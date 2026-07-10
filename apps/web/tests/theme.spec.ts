import { expect, test } from '@playwright/test';
import { CHURCH_ADMIN_STORAGE_STATE } from './global-setup';

test.describe('Theme Provider and Toggling', () => {
  test('should toggle theme between light and dark and apply appropriate classes', async ({
    page,
  }) => {
    await page.goto('/');

    const toggleButton = page.getByRole('button', { name: 'Toggle theme' });
    await expect(toggleButton).toBeVisible();

    // 1. Switch to Dark theme
    await toggleButton.click();
    const darkOption = page.getByRole('menuitem', { name: 'Dark' });
    await expect(darkOption).toBeVisible();
    await darkOption.click();

    // Verify HTML root has 'dark' class
    await expect(page.locator('html')).toHaveClass(/dark/);

    // 2. Switch to Light theme
    await toggleButton.click();
    const lightOption = page.getByRole('menuitem', { name: 'Light' });
    await expect(lightOption).toBeVisible();
    await lightOption.click();

    // Verify HTML root does NOT have 'dark' class
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });
});

test.describe('Theme toggle from the mobile nav drawer (US3, 021)', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test.use({ storageState: CHURCH_ADMIN_STORAGE_STATE });

  test('selecting dark/light/system from inside the open drawer applies immediately', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await page.getByTestId('mobile-drawer-trigger').click();
    await expect(page.getByTestId('mobile-drawer-content')).toBeVisible();

    const toggleButton = page.getByRole('button', { name: 'Toggle theme' });
    await expect(toggleButton).toBeVisible();

    await toggleButton.click();
    await page.getByRole('menuitem', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await toggleButton.click();
    await page.getByRole('menuitem', { name: 'Light' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    await toggleButton.click();
    await page.getByRole('menuitem', { name: 'System' }).click();
    await expect(page.getByTestId('mobile-drawer-content')).toBeVisible();
  });
});
