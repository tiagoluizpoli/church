import { expect, test } from '@playwright/test';
import { signInPersonaPage } from '../fixtures/journeys/rostering-church';
import { loadVolunteerDashboardJourney } from '../fixtures/journeys/volunteer-dashboard';

test('US5: volunteer keeps cached dashboard data readable across all three tabs after reloading offline', async ({
  page,
}, testInfo) => {
  // The journey owns its Volunteer persona and published schedule.
  const journey = loadVolunteerDashboardJourney({ testInfo });
  await signInPersonaPage({ page, persona: journey.personas.volunteer });
  // The Ministry Schedule tab's data fetches eagerly on mount (independent
  // of which tab is active) and only lands in the offline-readable cache
  // once this response resolves — waiting on the default tab's content
  // alone doesn't guarantee it, so a slow response under load can lose the
  // race against the offline simulation below.
  const ministryScheduleResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/volunteer/ministries/') &&
      response.url().includes('/schedule'),
  );
  await page.goto('/dashboard');

  await expect(
    page.getByText('My Upcoming Assignments', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(journey.careEvent.title).first()).toBeVisible();
  await ministryScheduleResponse;

  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => false,
    });
  });
  await page.route('**/api/v1/volunteer/**', (route) => route.abort());
  await page.reload();

  await expect(page.getByText('Offline mode', { exact: true })).toBeVisible();
  await expect(page.getByText(journey.careEvent.title).first()).toBeVisible();

  await page.getByRole('button', { name: 'Refresh dashboard' }).click();
  await expect(
    page.getByText(
      'Refresh failed while offline. Last-known dashboard data is still available.',
    ),
  ).toBeVisible();

  await page.getByRole('tab', { name: 'Ministry Schedule' }).click();
  await expect(page.getByText(journey.careEvent.title).first()).toBeVisible();

  await page.getByRole('tab', { name: /Availability Needed/i }).click();
  await expect(
    page.getByText(journey.availabilityEvent.title).first(),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Open availability editor' })
    .first()
    .click();
  await expect(
    page.getByRole('button', { name: 'Save availability' }),
  ).toBeDisabled();
});
