import { expect, type Page, test } from '@playwright/test';
import { requiredE2eUrl } from '@/tests/fixtures/e2e-urls';
import {
  newPersonaContext,
  signInPersonaPage,
} from '@/tests/fixtures/journeys/assign-church';
import {
  loadVolunteerAvailabilityJourney,
  type VolunteerAvailabilityJourney,
} from '@/tests/fixtures/journeys/volunteer-availability';

// DL4-US3 (P2, test-plan.md): a volunteer who belongs to two ministries opens
// their availability checks (one per ministry for the sent cycle), marks a
// shift unavailable on one check, then confirms a check that has a
// cross-ministry, same-date shift overlap: the confirm succeeds, since the
// overlap is refused at assign time (DOUBLE_BOOKED). This used to
// also cover the leader seeing per-volunteer acknowledgement state on the
// prepare page — see the KNOWN GAP note in the first test below.
const SERVER_URL = requiredE2eUrl({ variable: 'VITE_SERVER_URL' });

const CYCLE_NAME = 'US3 Overlap';

interface CycleResponse {
  id: string;
}

interface EventTemplateBsendResponse {
  id: string;
}

interface EventTemplateResponse {
  id: string;
  blocks: EventTemplateBsendResponse[];
}

interface ParticipationSummaryResponse {
  id: string;
}

interface ParticipationEventViewResponse {
  participation: ParticipationSummaryResponse;
}

interface CycleParticipationResponse {
  events: ParticipationEventViewResponse[];
}

interface AskAvailabilityForMinistryParams {
  page: Page;
  cycleId: string;
  ministryId: string;
}

async function askAvailabilityForMinistry({
  page,
  cycleId,
  ministryId,
}: AskAvailabilityForMinistryParams): Promise<void> {
  const participationResponse = await page.request.get(
    `${SERVER_URL}/api/v1/prepare/cycles/${cycleId}/participation`,
    { params: { ministryId } },
  );
  expect(participationResponse.ok()).toBeTruthy();
  const participation =
    (await participationResponse.json()) as CycleParticipationResponse;
  // A whole-month cycle always spans several Sundays — this is what lets one
  // shift be marked unavailable later while the rest still overlap the
  // sibling ministry's shifts on their shared dates.
  expect(participation.events.length).toBeGreaterThanOrEqual(2);

  for (const eventView of participation.events) {
    const requestResponse = await page.request.post(
      `${SERVER_URL}/api/v1/prepare/participations/${eventView.participation.id}/ask-availability`,
    );
    expect(requestResponse.ok()).toBeTruthy();
  }
}

interface SetUpTwoMinistryOverlapCycleParams {
  page: Page;
  journey: VolunteerAvailabilityJourney;
}

// Builds one sent cycle, applies a single Sunday template block to
// both Worship and Care, and requests availability for every generated event in
// both ministries. Because both ministries split the shared template block
// with an equal-1 shift, every Sunday produces a same-date, same-time shift
// pair across the two ministries — a guaranteed cross-ministry overlap for
// FR-020 (DL2-VA-05/06).
async function setUpTwoMinistryOverlapCycle({
  page,
  journey,
}: SetUpTwoMinistryOverlapCycleParams): Promise<void> {
  const worshipMinistryId = journey.ministries.worship.id;
  const careMinistryId = journey.ministries.care.id;

  const worshipDirectionResponse = await page.request.patch(
    `${SERVER_URL}/api/v1/admin/ministries/${worshipMinistryId}/default-direction`,
    { data: { defaultDirection: 'all_out' } },
  );
  expect(worshipDirectionResponse.ok()).toBeTruthy();

  const careDirectionResponse = await page.request.patch(
    `${SERVER_URL}/api/v1/admin/ministries/${careMinistryId}/default-direction`,
    { data: { defaultDirection: 'all_out' } },
  );
  expect(careDirectionResponse.ok()).toBeTruthy();

  const cycleResponse = await page.request.post(
    `${SERVER_URL}/api/v1/admin/cycles`,
    {
      data: {
        name: CYCLE_NAME,
        startDate: journey.cycleWindow.startDate,
        endDate: journey.cycleWindow.endDate,
      },
    },
  );
  expect(cycleResponse.ok()).toBeTruthy();
  const cycle = (await cycleResponse.json()) as CycleResponse;

  const templateResponse = await page.request.post(
    `${SERVER_URL}/api/v1/admin/event-templates`,
    {
      data: {
        name: 'US3 Overlap Template',
        weekday: 0,
        blocks: [
          {
            label: 'Gathering',
            startTime: '09:00',
            endTime: '10:00',
          },
        ],
      },
    },
  );
  expect(templateResponse.ok()).toBeTruthy();
  const template = (await templateResponse.json()) as EventTemplateResponse;
  const block = template.blocks[0];
  if (!block) {
    throw new Error('Expected the overlap template to have one block.');
  }

  const worshipUsualSetupResponse = await page.request.put(
    `${SERVER_URL}/api/v1/admin/ministries/${worshipMinistryId}/usual-setup`,
    {
      data: {
        entries: [
          {
            sourceTemplateTimeBlockId: block.id,
            serves: true,
            shiftSplit: { kind: 'equal', count: 1 },
            headcounts: [
              {
                sectorId: journey.ministries.worship.sectors.stage.id,
                roleId: journey.ministries.worship.roles.usher.id,
                peopleNeeded: 1,
              },
            ],
          },
        ],
      },
    },
  );
  expect(worshipUsualSetupResponse.ok()).toBeTruthy();

  const careUsualSetupResponse = await page.request.put(
    `${SERVER_URL}/api/v1/admin/ministries/${careMinistryId}/usual-setup`,
    {
      data: {
        entries: [
          {
            sourceTemplateTimeBlockId: block.id,
            serves: true,
            shiftSplit: { kind: 'equal', count: 1 },
            headcounts: [
              {
                sectorId: journey.ministries.care.sectors.lobby.id,
                roleId: journey.ministries.care.roles.careHost.id,
                peopleNeeded: 1,
              },
            ],
          },
        ],
      },
    },
  );
  expect(careUsualSetupResponse.ok()).toBeTruthy();

  const applyResponse = await page.request.post(
    `${SERVER_URL}/api/v1/admin/cycles/${cycle.id}/apply-templates`,
    { data: { templateIds: [template.id] } },
  );
  expect(applyResponse.ok()).toBeTruthy();

  const sendResponse = await page.request.post(
    `${SERVER_URL}/api/v1/admin/cycles/${cycle.id}/send`,
  );
  expect(sendResponse.ok()).toBeTruthy();

  await askAvailabilityForMinistry({
    page,
    cycleId: cycle.id,
    ministryId: worshipMinistryId,
  });
  await askAvailabilityForMinistry({
    page,
    cycleId: cycle.id,
    ministryId: careMinistryId,
  });
}

interface OpenWorshipCheckAndMarkOneShiftUnavailableParams {
  page: Page;
  journey: VolunteerAvailabilityJourney;
}

async function openWorshipCheckAndMarkOneShiftUnavailable({
  page,
  journey,
}: OpenWorshipCheckAndMarkOneShiftUnavailableParams): Promise<void> {
  await page.goto('/volunteer/availability');

  await expect(page.getByTestId('availability-check-list')).toBeVisible();
  // One check per ministry membership for the sent cycle: Worship (leader
  // membership) and Care (volunteer membership). The journey's own Church
  // holds no other cycle, so the ministry name alone selects one card.
  const worshipCard = page
    .getByTestId('availability-check-card')
    .filter({ hasText: journey.ministries.worship.name })
    .filter({ hasText: CYCLE_NAME });
  await expect(worshipCard).toHaveCount(1);

  const careCard = page
    .getByTestId('availability-check-card')
    .filter({ hasText: journey.ministries.care.name })
    .filter({ hasText: CYCLE_NAME });
  await expect(careCard).toHaveCount(1);

  await worshipCard.click();

  await expect(page.getByTestId('availability-check-detail')).toBeVisible();

  const shiftRows = page.getByTestId('shift-availability-row');
  expect(await shiftRows.count()).toBeGreaterThanOrEqual(2);

  const unavailableShiftsResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/availability-checks/') &&
      response.url().endsWith('/unavailable-shifts') &&
      response.request().method() === 'PUT',
  );
  await shiftRows.first().getByTestId('mark-unavailable-toggle').click();
  await page.getByTestId('save-unavailable-shifts-button').click();
  const unavailableShiftsResponse = await unavailableShiftsResponsePromise;
  expect(unavailableShiftsResponse.ok()).toBeTruthy();
}

test('volunteer in two ministries confirms despite a cross-ministry overlap', async ({
  browser,
  page,
}, testInfo) => {
  const journey = loadVolunteerAvailabilityJourney({ testInfo });
  await signInPersonaPage({ page, persona: journey.personas.leader });
  await setUpTwoMinistryOverlapCycle({ page, journey });

  await openWorshipCheckAndMarkOneShiftUnavailable({ page, journey });

  const confirmResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/availability-checks/') &&
      response.url().endsWith('/confirm') &&
      response.request().method() === 'POST',
  );
  await page.getByTestId('confirm-availability-button').click();
  const confirmResponse = await confirmResponsePromise;

  // An overlap no longer blocks the confirm (DL2-VA-05).
  expect(confirmResponse.status()).toBe(204);

  // A single-ministry volunteer's clean confirm still exercises the
  // underlying availability-confirm flow, even though the leader-facing
  // verification that used to follow it is gone — see the note below.
  // Uses the volunteer persona, a member of Worship alone.
  const singleMinistryActorContext = await newPersonaContext({
    browser,
    persona: journey.personas.volunteer,
  });
  const singleMinistryActorPage = await singleMinistryActorContext.newPage();
  await singleMinistryActorPage.goto('/volunteer/availability');

  const cleanVolunteerCard = singleMinistryActorPage
    .getByTestId('availability-check-card')
    .filter({ hasText: CYCLE_NAME })
    .filter({ hasText: journey.ministries.worship.name });
  await expect(cleanVolunteerCard).toHaveCount(1);
  await cleanVolunteerCard.click();
  await expect(
    singleMinistryActorPage.getByTestId('availability-check-detail'),
  ).toBeVisible();

  const singleMinistryConfirmResponsePromise =
    singleMinistryActorPage.waitForResponse(
      (response) =>
        response.url().includes('/availability-checks/') &&
        response.url().endsWith('/confirm') &&
        response.request().method() === 'POST',
    );
  await singleMinistryActorPage
    .getByTestId('confirm-availability-button')
    .click();
  const singleMinistryConfirmResponse =
    await singleMinistryConfirmResponsePromise;
  expect(singleMinistryConfirmResponse.status()).toBe(204);
  await singleMinistryActorContext.close();

  // KNOWN GAP: this test used to finish with the leader opening the
  // prepare workspace to check a per-volunteer Acknowledged/Not-looked
  // status list (`AvailabilityStatusSection`) showing this confirm next to
  // Grace Hopper's untouched check. That view was dropped when the old
  // event-card prepare UI (`participation-prepare.tsx`) was replaced
  // by the day-grouped workspace in commit a04911d and was never rebuilt
  // into the new UI — `availability-status-section.tsx` still exists but
  // is unused by any route. Restore this assertion once that leader-facing
  // view exists again.
});
