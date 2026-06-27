import { expect, test } from '@playwright/test';

test.describe('Desktop Layout Shell', () => {
  // Enforce desktop viewport
  test.use({ viewport: { width: 1280, height: 800 } });

  test('should expand and collapse sidebar, and show breadcrumbs', async ({
    page,
  }) => {
    await page.goto('/');

    const sidebar = page.getByTestId('sidebar');
    const toggleButton = page.getByTestId('sidebar-toggle');
    const breadcrumbs = page.getByTestId('breadcrumbs');

    // 1. Initial expanded state on desktop
    await expect(sidebar).toBeVisible();
    await expect(breadcrumbs).toBeVisible();

    // Check bounding box width (approx 240px)
    await expect
      .poll(async () => {
        const box = await sidebar.boundingBox();
        return box?.width;
      })
      .toBe(240);

    // 2. Click collapse
    await toggleButton.click();

    // Check collapsed state (width should be 64px)
    await expect
      .poll(async () => {
        const box = await sidebar.boundingBox();
        return box?.width;
      })
      .toBe(64);

    // 3. Click expand back
    await toggleButton.click();
    await expect
      .poll(async () => {
        const box = await sidebar.boundingBox();
        return box?.width;
      })
      .toBe(240);
  });
});
