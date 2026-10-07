import { expect, test } from '@playwright/test';
import { requiredE2eUrl } from '../fixtures/e2e-urls';
import { loadRosterPublishJourney } from '../fixtures/journeys/roster-publish';
import {
  newPersonaContext,
  requirementCellTestId,
  rosteringTailoringPath,
  shortVolunteerName,
  signInPersonaPage,
} from '../fixtures/journeys/rostering-church';

const SERVER_URL = requiredE2eUrl({ variable: 'VITE_SERVER_URL' });

interface ParticipationSummaryResponse {
  id: string;
  state: string;
}

interface ParticipationEventResponse {
  participation: ParticipationSummaryResponse;
}

interface ParticipationResponse {
  events: ParticipationEventResponse[];
}

test('DL4-US4 leader assigns one volunteer, publishes below full, volunteer sees published slice, sibling ministry stays unpublished', async ({
  browser,
  page,
}, testInfo) => {
  // The journey owns its Planning Cycle and both Participations: publish is
  // cycle-wide, and the sibling Ministry must start (and stay) unpublished.
  const journey = loadRosterPublishJourney({ testInfo });
  const worshipMinistryId = journey.ministries.worship.id;
  const careMinistryId = journey.ministries.care.id;
  const planningCycleId = journey.cycle.id;
  const worshipParticipationId = journey.worship.id;
  const careParticipationId = journey.care.id;
  const eventTitle = journey.event.title;
  const volunteerName = journey.personas.volunteer.name;
  const requiredCount = journey.worship.requiredCount;
  await signInPersonaPage({ page, persona: journey.personas.leader });

  await page.goto(
    rosteringTailoringPath({
      ministryId: worshipMinistryId,
      cycleId: planningCycleId,
    }),
  );

  const eventRow = page
    .locator('[data-testid^="tailoring-slot-row-"]')
    .filter({ hasText: eventTitle })
    .first();
  await expect(eventRow).toBeVisible();
  await expect(eventRow.getByTestId('participation-state-badge')).toHaveText(
    'Availability requested',
  );

  await eventRow
    .getByTestId(`open-roster-link-${worshipParticipationId}`)
    .click();

  await expect(page.getByTestId('cycle-builder')).toBeVisible({
    timeout: 15_000,
  });

  const requirement = page.getByTestId(
    requirementCellTestId({
      shiftId: journey.worship.shiftId,
      roleId: journey.ministries.worship.roles.usher.id,
    }),
  );
  await expect(requirement).toContainText(`0/${requiredCount}`);

  // Pick by name, not the first picker option — the dashboard asserts this
  // exact person, and picker order is availability/workload-driven.
  const volunteerPool = page.getByTestId('volunteer-pool');
  await volunteerPool
    .getByLabel('Search volunteers by name')
    .fill(volunteerName);
  await volunteerPool.getByTestId('volunteer-select-slot').click();

  await requirement.getByRole('button', { name: /^Assign / }).click();
  await expect(requirement.getByTestId('assignment-chip')).toContainText(
    volunteerName,
  );
  await expect(requirement).toContainText(`1/${requiredCount}`);

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
      `${SERVER_URL}/api/v1/tailoring/cycles/${planningCycleId}/participation`,
      { params: { ministryId: worshipMinistryId } },
    ),
    page.request.get(
      `${SERVER_URL}/api/v1/tailoring/cycles/${planningCycleId}/participation`,
      { params: { ministryId: careMinistryId } },
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
      (event) => event.participation.id === worshipParticipationId,
    )?.participation.state,
  ).toBe('published');
  expect(
    careStateBody.events.find(
      (event) => event.participation.id === careParticipationId,
    )?.participation.state,
  ).toBe('availability_fired');

  const volunteerContext = await newPersonaContext({
    browser,
    persona: journey.personas.volunteer,
  });
  const volunteerPage = await volunteerContext.newPage();

  // Name the Worship Ministry explicitly: the dashboard otherwise defaults to
  // the Volunteer's earliest upcoming assignment's Ministry.
  await volunteerPage.goto(
    `/dashboard?section=ministry_schedule&ministryId=${worshipMinistryId}`,
  );
  await expect(
    volunteerPage.getByRole('tab', { name: 'Ministry Schedule' }),
  ).toHaveAttribute('aria-selected', 'true');
  const scheduleToggle = volunteerPage.getByRole('button', {
    name: `Show schedule for ${eventTitle}`,
  });
  await expect(scheduleToggle).toBeVisible();
  await scheduleToggle.click();
  await expect(
    volunteerPage.getByRole('button', {
      name: `Hide schedule for ${eventTitle}`,
    }),
  ).toBeVisible();
  await expect(
    volunteerPage.getByText(
      `Volunteer: ${shortVolunteerName({ name: volunteerName })}`,
      {
        exact: true,
      },
    ),
  ).toBeVisible();

  await volunteerContext.close();
});
