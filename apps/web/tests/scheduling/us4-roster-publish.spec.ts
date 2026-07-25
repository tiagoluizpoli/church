import { expect, test } from '@playwright/test';
import { LEADER_STORAGE_STATE, VOLUNTEER_STORAGE_STATE } from '../global-setup';

const SERVER_URL = process.env.VITE_SERVER_URL ?? 'http://localhost:4000';
// Set by playwright.config.ts alongside VITE_SERVER_URL — the web port used
// to be hardcoded as "SERVER_URL's port + 1", which broke once the e2e run
// moved off the normal-dev 4000/4001 pair (see playwright.config.ts).
const WEB_URL = process.env.PW_WEB_URL ?? 'http://localhost:4001';
const WORSHIP_MINISTRY_ID = 'e2e33333-3333-3333-3333-333333333331';
const CARE_MINISTRY_ID = 'e2e33333-3333-3333-3333-333333333332';
// Publish is cycle-wide, so this spec owns a cycle no other spec touches
// (`us4PlanningCycle` in `e2e-seed.ts`). Sharing December let run-order decide
// the start state.
const PLANNING_CYCLE_ID = 'e2e21111-2222-2222-2222-222222222222';
const WORSHIP_PARTICIPATION_ID = 'e2e61111-1111-1111-1111-111111111117';
const CARE_PARTICIPATION_ID = 'e2e61111-1111-1111-1111-111111111118';
const WORSHIP_SHIFT_ID = 'e2e71111-1111-1111-1111-111111111117';
const USHER_ROLE_ID = 'e2e55555-5555-5555-5555-555555555551';
const EVENT_TITLE = 'E2E US4 Publish Service';
const VOLUNTEER_NAME = 'E2E Volunteer';
// Rail + dashboard abbreviate via formatVolunteerName (FR-013); the chip shows
// the full name — both forms asserted where each appears.
const VOLUNTEER_SHORT_NAME = 'E2E V.';
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
  await page.goto(
    `/scheduling/tailoring/${WORSHIP_MINISTRY_ID}/${PLANNING_CYCLE_ID}`,
  );

  const eventRow = page
    .locator('[data-testid^="tailoring-slot-row-"]')
    .filter({ hasText: EVENT_TITLE })
    .first();
  await expect(eventRow).toBeVisible();
  await expect(eventRow.getByTestId('participation-state-badge')).toHaveText(
    'Availability requested',
  );

  await eventRow
    .getByTestId(`open-roster-link-${WORSHIP_PARTICIPATION_ID}`)
    .click();

  await expect(page.getByTestId('cycle-builder')).toBeVisible({
    timeout: 15_000,
  });

  const requirement = page.getByTestId(
    `cycle-requirement-${WORSHIP_SHIFT_ID}-${USHER_ROLE_ID}`,
  );
  await expect(requirement).toContainText(`0/${REQUIRED_COUNT}`);

  // Pick by name, not the first picker option — the dashboard asserts this
  // exact person, and picker order is availability/workload-driven.
  const volunteerPool = page.getByTestId('volunteer-pool');
  await volunteerPool
    .getByLabel('Search volunteers by name')
    .fill(VOLUNTEER_NAME);
  await volunteerPool.getByTestId('volunteer-select-slot').click();

  await requirement.getByRole('button', { name: /^Assign / }).click();
  await expect(requirement.getByTestId('assignment-chip')).toContainText(
    VOLUNTEER_NAME,
  );
  await expect(requirement).toContainText(`1/${REQUIRED_COUNT}`);

  await page.getByRole('button', { name: 'Publish cycle' }).first().click();
  const publishDialog = page.getByRole('dialog', {
    name: 'Publish this cycle?',
  });
  // One seat still open — the below-full publish; the confirm authorises it.
  await expect(publishDialog).toContainText(
    'shifts are below their staffing target',
  );
  await publishDialog.getByRole('button', { name: 'Publish cycle' }).click();
  await expect(page.getByText('Cycle published')).toBeVisible();

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
    baseURL: WEB_URL,
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
    volunteerPage.getByText(`Volunteer: ${VOLUNTEER_SHORT_NAME}`, {
      exact: true,
    }),
  ).toBeVisible();

  await volunteerContext.close();
});
