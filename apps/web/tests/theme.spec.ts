import { expect, test } from '@playwright/test';

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
