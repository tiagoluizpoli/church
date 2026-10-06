import { expect, test } from '@playwright/test';
import { signInPersonaPage } from '../fixtures/journeys/rostering-church';
import { loadVolunteerDashboardJourney } from '../fixtures/journeys/volunteer-dashboard';

test('US1: volunteer finds availability task and opens event editor within 10 seconds', async ({
  page,
}, testInfo) => {
  // The journey owns its Volunteer persona and published schedule.
  const journey = loadVolunteerDashboardJourney({ testInfo });
  await signInPersonaPage({ page, persona: journey.personas.volunteer });
  const eventTitle = journey.availabilityEvent.title;
  const startedAt = Date.now();

  await page.goto(
    `/dashboard?section=availability&eventId=${journey.availabilityEvent.id}`,
  );

  await expect(
    page.getByText('Availability needed', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(eventTitle, { exact: true }).first(),
  ).toBeVisible();

  const elapsedMs = Date.now() - startedAt;
  expect(elapsedMs).toBeLessThan(10_000);

  await expect(
    page.getByText('Availability editor', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(eventTitle, { exact: true }).last(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Save availability' }),
  ).toBeDisabled();
});
