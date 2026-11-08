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

  const requestResponse = await page.request.post(
    `${SERVER_URL}/api/v1/prepare/cycles/${cycleId}/ask-availability`,
    { data: { ministryId } },
  );
  expect(requestResponse.ok()).toBeTruthy();
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
    `${SERVER_URL}/api/v1/ministries/${worshipMinistryId}/usual-setup/${block.id}`,
    {
      data: {
        serves: true,
        shiftSplit: { kind: 'equal', count: 1 },
        headcounts: [
          {
            shiftIndex: 0,
            sectorId: journey.ministries.worship.sectors.stage.id,
            roleId: journey.ministries.worship.roles.usher.id,
            peopleNeeded: 1,
          },
        ],
      },
    },
  );
  expect(worshipUsualSetupResponse.ok()).toBeTruthy();

  const careUsualSetupResponse = await page.request.put(
    `${SERVER_URL}/api/v1/ministries/${careMinistryId}/usual-setup/${block.id}`,
    {
      data: {
        serves: true,
        shiftSplit: { kind: 'equal', count: 1 },
        headcounts: [
          {
            shiftIndex: 0,
            sectorId: journey.ministries.care.sectors.lobby.id,
            roleId: journey.ministries.care.roles.careHost.id,
            peopleNeeded: 1,
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

test('J7: volunteers answer overlapping Ministry checks', async ({
  browser,
  page,
}, testInfo) => {
  const journey = loadVolunteerAvailabilityJourney({ testInfo });
  await signInPersonaPage({ page, persona: journey.personas.leader });
  await setUpTwoMinistryOverlapCycle({ page, journey });
  await page.goto('/availability');

  const worshipCard = page
    .getByRole('link')
    .filter({
      hasText: journey.ministries.worship.name,
    })
    .filter({ hasText: CYCLE_NAME });
  const careCard = page
    .getByRole('link')
    .filter({
      hasText: journey.ministries.care.name,
    })
    .filter({ hasText: CYCLE_NAME });
  await expect(worshipCard).toHaveCount(1);
  await expect(careCard).toHaveCount(1);
  await worshipCard.click();

  const shifts = page.getByRole('switch', {
    name: 'Indisponível',
    exact: true,
  });
  await expect(shifts.first()).toBeVisible();
  expect(await shifts.count()).toBeGreaterThanOrEqual(2);
  const days = page.getByRole('region').filter({ has: shifts });
  expect(await days.count()).toBeGreaterThanOrEqual(2);
  await expect(days.first().getByRole('heading', { level: 3 })).toBeVisible();
  await shifts.first().click();
  const answerRequests: string[] = [];
  page.on('request', (request) => {
    if (
      request.url().includes('/availability-checks/') &&
      request.method() === 'PUT'
    ) {
      answerRequests.push(request.url());
    }
  });
  const answerResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/answer') &&
      response.request().method() === 'PUT',
  );
  await page
    .getByRole('button', { name: /Confirmar: indisponível para 1 de/ })
    .click();
  expect((await answerResponse).status()).toBe(200);
  await expect(worshipCard).toContainText(
    'Confirmada · indisponível para 1 de',
  );
  expect(answerRequests).toHaveLength(1);

  // The remaining Worship shifts overlap Care's shifts; confirming Care must succeed.
  await careCard.click();
  const overlapResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/answer') &&
      response.request().method() === 'PUT',
  );
  await page
    .getByRole('button', { name: 'Confirmar: disponível para tudo' })
    .click();
  expect((await overlapResponse).status()).toBe(200);
  await expect(careCard).toContainText('Confirmada, disponível para tudo');
  expect(answerRequests).toHaveLength(2);

  const volunteerContext = await newPersonaContext({
    browser,
    persona: journey.personas.volunteer,
  });
  const volunteerPage = await volunteerContext.newPage();
  await volunteerPage.goto('/availability');
  const volunteerCard = volunteerPage
    .getByRole('link')
    .filter({
      hasText: journey.ministries.worship.name,
    })
    .filter({ hasText: CYCLE_NAME });
  await expect(volunteerCard).toHaveCount(1);
  await volunteerCard.click();
  const cleanResponse = volunteerPage.waitForResponse(
    (response) =>
      response.url().endsWith('/answer') &&
      response.request().method() === 'PUT',
  );
  await volunteerPage
    .getByRole('button', { name: 'Confirmar: disponível para tudo' })
    .click();
  expect((await cleanResponse).status()).toBe(200);
  await expect(volunteerCard).toContainText('Confirmada, disponível para tudo');
  await volunteerContext.close();
});
