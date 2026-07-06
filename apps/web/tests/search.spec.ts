import { expect, test } from '@playwright/test';
import { VOLUNTEER_STORAGE_STATE } from './global-setup';

test.describe('Global Search Command Palette', () => {
  test.use({ storageState: VOLUNTEER_STORAGE_STATE });

  test('should open command palette on keyboard shortcut, filter items, and navigate', async ({
    page,
  }) => {
    await page.goto('/');

    const palette = page.getByTestId('command-palette');
    await expect(palette).not.toBeVisible();

    // 1. Trigger via keyboard shortcut (Control+k)
    await page.keyboard.press('Control+k');
    await expect(palette).toBeVisible();

    const input = page.getByPlaceholder('Type a command or search...');
    await expect(input).toBeFocused();

    // 2. Type search query to filter
    await input.fill('dashboard');

    const resultLink = page.getByRole('link', { name: 'Go to Dashboard' });
    await expect(resultLink).toBeVisible();

    // 3. Click search result and verify navigation
    await resultLink.click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(palette).not.toBeVisible();

    // 4. Open again and test escape key closing
    await page.keyboard.press('Control+k');
    await expect(palette).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(palette).not.toBeVisible();
  });
});
