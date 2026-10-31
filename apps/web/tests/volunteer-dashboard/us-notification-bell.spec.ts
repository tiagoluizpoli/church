import { m } from '@church/i18n/messages';
import { expect, test } from '@playwright/test';
import { signInPersonaPage } from '@/tests/fixtures/journeys/assign-church';
import { loadVolunteerDashboardJourney } from '@/tests/fixtures/journeys/volunteer-dashboard';

test('US2: bell shows unread count, opens dropdown, deep-links, and views full history', async ({
  page,
}, testInfo) => {
  // The journey owns its Volunteer persona, published schedule and
  // notification: no other spec's decline or publish reaches this dashboard.
  const journey = loadVolunteerDashboardJourney({ testInfo });
  await signInPersonaPage({ page, persona: journey.personas.volunteer });
  await page.goto('/dashboard');

  const bellTrigger = page.getByRole('button', {
    name: m.notification_bell_label({}, { locale: 'pt-BR' }),
  });
  await expect(bellTrigger).toBeVisible();

  // The journey owns the Volunteer's only notification, so the unread count
  // is exact.
  await expect(bellTrigger.locator('[data-slot="badge"]')).toHaveText('1');

  await bellTrigger.click();
  const title = m.notification_ministry_invitation_title(
    { ministryName: journey.notification.ministryName },
    { locale: 'pt-BR' },
  );
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  const viewAllLink = page.getByRole('link', {
    name: m.notification_view_all({}, { locale: 'pt-BR' }),
  });
  await expect(viewAllLink).toHaveAttribute('href', '/notifications');

  // Selecting opens the detail and marks it read; only Open navigates.
  await page.getByText(title, { exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText(title, { exact: true })).toBeVisible();
  await expect(bellTrigger.locator('[data-slot="badge"]')).toHaveCount(0);
  await sheet
    .getByRole('button', {
      name: m.notification_open_context({}, { locale: 'pt-BR' }),
    })
    .click();
  await expect(page).toHaveURL(/\/invitations\/ministry\//);

  await page.goto('/notifications');
  await expect(
    page.getByRole('button', {
      name: m.notification_mark_all_read({}, { locale: 'pt-BR' }),
    }),
  ).toBeVisible();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
});
