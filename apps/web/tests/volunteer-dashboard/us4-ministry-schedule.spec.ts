import { expect, test } from '@playwright/test';
import {
  shortVolunteerName,
  signInPersonaPage,
} from '../fixtures/journeys/rostering-church';
import { loadVolunteerDashboardJourney } from '../fixtures/journeys/volunteer-dashboard';

const DASHBOARD_URL = '/dashboard?section=ministry_schedule';

test('US4: volunteer browses ministry schedule and switches ministries when available', async ({
  page,
}, testInfo) => {
  // The journey owns its Volunteer persona and published schedule.
  const journey = loadVolunteerDashboardJourney({ testInfo });
  await signInPersonaPage({ page, persona: journey.personas.volunteer });
  await page.goto(DASHBOARD_URL);

  await expect(
    page.getByRole('tab', { name: 'Ministry Schedule' }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByText(
      'Browse published schedule rows without leader-only conflict or audit details.',
      { exact: true },
    ),
  ).toBeVisible();

  const ministrySelector = page.getByRole('combobox', {
    name: 'Select ministry',
  });

  await expect(ministrySelector).toBeVisible();
  await ministrySelector.click();
  await page
    .getByRole('option', { name: journey.ministries.care.name })
    .click();

  await page
    .getByRole('button', {
      name: `Show schedule for ${journey.careEvent.title}`,
    })
    .click();

  await expect(
    page.getByText(journey.ministries.care.roles.careHost.name).first(),
  ).toBeVisible();
  await expect(
    page.getByText(
      `Volunteer: ${shortVolunteerName({ name: journey.personas.volunteer.name })}`,
    ),
  ).toBeVisible();
  await expect(
    page.getByText(`Team: ${journey.ministries.care.teams.care.name}`),
  ).toBeVisible();
});
