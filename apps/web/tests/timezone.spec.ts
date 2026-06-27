import { expect, test } from '@playwright/test';

test.describe('Timezone Policy', () => {
  // Emulate a user in London (UTC+1 in May)
  test.use({ timezoneId: 'Europe/London' });

  // NOTE: This test verifies the Church Time / Local Time toggle state only.
  // Event-row date-format assertions were removed when the home EventList
  // moved from mock data to real tRPC data. Restoring deterministic
  // date-format coverage requires an authenticated, seeded event at `/`,
  // which depends on the e2e auth + seed fixtures tracked in T126.
  test('should toggle between Church Time and Local Time', async ({ page }) => {
    await page.goto('/');

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
