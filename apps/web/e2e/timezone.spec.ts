import { expect, test } from '@playwright/test';

test.describe('Timezone Policy', () => {
  // Emulate a user in London (UTC+1 in May)
  test.use({ timezoneId: 'Europe/London' });

  test('should correctly shift event times based on timezone mode', async ({
    page,
  }) => {
    await page.goto('/');

    const toggleButton = page.getByRole('button', {
      name: /Church Time|Local Time/,
    });
    const firstEventStart = page
      .locator('p')
      .filter({ hasText: 'Start:' })
      .first();

    // Initial state: Church Time (America/New_York is configured in main.tsx)
    // Event: 2026-05-10T09:00:00Z -> NYC is UTC-4 -> 5:00 AM
    await expect(toggleButton).toContainText('Church Time');
    await expect(firstEventStart).toContainText('May 10, 2026, 5:00:00 AM');

    // Toggle to Local Time (London: UTC+1)
    // Event: 2026-05-10T09:00:00Z -> London is UTC+1 -> 10:00 AM
    await toggleButton.click();
    await expect(toggleButton).toContainText('Local Time');
    await expect(firstEventStart).toContainText('May 10, 2026, 10:00:00 AM');

    // Toggle back to Church Time
    await toggleButton.click();
    await expect(toggleButton).toContainText('Church Time');
    await expect(firstEventStart).toContainText('May 10, 2026, 5:00:00 AM');
  });
});
