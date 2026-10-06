import { expect, test } from '@playwright/test';
import { signInPersonaPage } from '../fixtures/journeys/rostering-church';
import { loadVolunteerDashboardJourney } from '../fixtures/journeys/volunteer-dashboard';

test('US2: bell shows unread count, opens dropdown, deep-links, and views full history', async ({
  page,
}, testInfo) => {
  // The journey owns its Volunteer persona, published schedule and
  // notification: no other spec's decline or publish reaches this dashboard.
  const journey = loadVolunteerDashboardJourney({ testInfo });
  await signInPersonaPage({ page, persona: journey.personas.volunteer });
  await page.goto('/dashboard');

  const bellTrigger = page.getByRole('button', { name: 'Notifications' });
  await expect(bellTrigger).toBeVisible();

  // The journey owns the Volunteer's only notification, so the unread count
  // is exact.
  await expect(bellTrigger.locator('[data-slot="badge"]')).toHaveText('1');

  await expect(
    page.getByText('Notifications Inbox', { exact: true }),
  ).toHaveCount(0);

  await bellTrigger.click();
  await expect(
    page.getByText(journey.notification.title, { exact: true }),
  ).toBeVisible();

  const viewAllLink = page.getByRole('link', { name: 'View all' });
  await expect(viewAllLink).toHaveAttribute('href', '/notifications');

  await page.getByText(journey.notification.title, { exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\?.*section=assignments/);

  await page.goto('/notifications');
  await expect(
    page.getByRole('button', { name: 'Mark all as read' }),
  ).toBeVisible();
  await expect(
    page.getByText(journey.notification.title, { exact: true }),
  ).toBeVisible();
});
