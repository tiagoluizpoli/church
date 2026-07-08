import { expect, test } from '@playwright/test';
import { LEADER_STORAGE_STATE, VOLUNTEER_STORAGE_STATE } from '../global-setup';

const SERVER_URL = process.env.VITE_SERVER_URL ?? 'http://localhost:4000';
const WORSHIP_MINISTRY_ID = 'e2e33333-3333-3333-3333-333333333331';
const CARE_MINISTRY_ID = 'e2e33333-3333-3333-3333-333333333332';
const PLANNING_CYCLE_ID = 'e2e21111-1111-1111-1111-111111111111';
const WORSHIP_PARTICIPATION_ID = 'e2e61111-1111-1111-1111-111111111114';
const CARE_PARTICIPATION_ID = 'e2e61111-1111-1111-1111-111111111116';
const USHER_REQUIREMENT_ID = 'e2e88888-8888-8888-8888-888888888885';
const SCHEDULING_VOLUNTEER_ID = 'e2e44444-4444-4444-4444-444444444442';
const EVENT_TITLE = 'E2E Sub-Leader Service';
const REQUIRED_COUNT = 2;

interface ParticipationResponse {
  events: Array<{
    participation: {
      id: string;
      state: string;
    };
  }>;
}

test.use({ storageState: LEADER_STORAGE_STATE });

test('DL4-US4 leader assigns one volunteer, publishes below full, volunteer sees published slice, sibling ministry stays unpublished', async ({
  browser,
  page,
}) => {
  await page.goto('/scheduling/tailoring');
  await expect(page.getByTestId('tailoring-ministry-select')).toBeVisible();
  await page.getByTestId('tailoring-ministry-select').click();
  await page
    .getByTestId(`tailoring-ministry-option-${WORSHIP_MINISTRY_ID}`)
    .click();
  await page.getByTestId('tailoring-cycle-select').click();
  await page.getByTestId(`tailoring-cycle-option-${PLANNING_CYCLE_ID}`).click();

  const eventCard = page
    .getByTestId('participation-event-card')
    .filter({ hasText: EVENT_TITLE })
    .first();
  await expect(eventCard).toBeVisible();
  await expect(eventCard.getByTestId('participation-state-badge')).toHaveText(
    'availability_fired',
  );

  await eventCard
    .getByTestId(`open-roster-link-${WORSHIP_PARTICIPATION_ID}`)
    .click();

  await expect(page.getByTestId('roster-page')).toBeVisible();
  await expect(page.getByTestId('roster-completion-summary')).toContainText(
    `0 assigned across ${REQUIRED_COUNT} required positions.`,
  );

  await page
    .getByTestId(`assign-${USHER_REQUIREMENT_ID}-${SCHEDULING_VOLUNTEER_ID}`)
    .click();

  await expect(page.getByTestId('roster-completion-summary')).toContainText(
    `1 assigned across ${REQUIRED_COUNT} required positions.`,
  );

  page.once('dialog', (dialog) => dialog.accept());
  const publishPromise = page.waitForResponse(
    (response) =>
      response.url().includes('/publish') && response.status() === 204,
  );
  await page.getByTestId('publish-participation-button').click();
  await publishPromise;

  const [worshipStateResponse, careStateResponse] = await Promise.all([
    page.request.get(
      `${SERVER_URL}/api/v1/leader/cycles/${PLANNING_CYCLE_ID}/participation`,
      { params: { ministryId: WORSHIP_MINISTRY_ID } },
    ),
    page.request.get(
      `${SERVER_URL}/api/v1/leader/cycles/${PLANNING_CYCLE_ID}/participation`,
      { params: { ministryId: CARE_MINISTRY_ID } },
    ),
  ]);
  expect(worshipStateResponse.ok()).toBeTruthy();
  expect(careStateResponse.ok()).toBeTruthy();

  const worshipStateBody =
    (await worshipStateResponse.json()) as ParticipationResponse;
  const careStateBody =
    (await careStateResponse.json()) as ParticipationResponse;

  expect(
    worshipStateBody.events.find(
      (event) => event.participation.id === WORSHIP_PARTICIPATION_ID,
    )?.participation.state,
  ).toBe('published');
  expect(
    careStateBody.events.find(
      (event) => event.participation.id === CARE_PARTICIPATION_ID,
    )?.participation.state,
  ).toBe('availability_fired');

  const volunteerContext = await browser.newContext({
    baseURL: 'http://localhost:4001',
    storageState: VOLUNTEER_STORAGE_STATE,
  });
  const volunteerPage = await volunteerContext.newPage();

  await volunteerPage.goto('/dashboard?section=ministry_schedule');
  await expect(
    volunteerPage.getByRole('tab', { name: 'Ministry Schedule' }),
  ).toHaveAttribute('aria-selected', 'true');
  const scheduleToggle = volunteerPage.getByRole('button', {
    name: `Show schedule for ${EVENT_TITLE}`,
  });
  await expect(scheduleToggle).toBeVisible();
  await scheduleToggle.click();
  await expect(
    volunteerPage.getByRole('button', {
      name: `Hide schedule for ${EVENT_TITLE}`,
    }),
  ).toBeVisible();
  await expect(
    volunteerPage.getByText('Volunteer: E2E V.', { exact: true }),
  ).toBeVisible();

  await volunteerContext.close();
});
