import { expect, type Page, test } from '@playwright/test';
import { requiredE2eUrl } from '../fixtures/e2e-urls';
import {
  newPersonaContext,
  signInPersonaPage,
} from '../fixtures/journeys/rostering-church';
import {
  loadVolunteerAvailabilityJourney,
  type VolunteerAvailabilityJourney,
} from '../fixtures/journeys/volunteer-availability';

// DL4-US3 (P2, test-plan.md): a volunteer who belongs to two ministries opens
// their availability checks (one per ministry for the locked cycle), marks a
// shift unavailable on one check, then confirms a check that has a
// cross-ministry, same-date shift overlap. The confirm outcome depends on the
// VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE flag (FR-020, SC-007). This used to
// also cover the leader seeing per-volunteer acknowledgement state on the
// tailoring page — see the KNOWN GAP note in the first test below.
const SERVER_URL = requiredE2eUrl({ variable: 'VITE_SERVER_URL' });

const CYCLE_NAME = 'US3 Overlap';

interface PlanningCycleResponse {
  id: string;
}

interface EventTemplateBlockResponse {
  id: string;
}

interface EventTemplateResponse {
  id: string;
  blocks: EventTemplateBlockResponse[];
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

interface ConfirmOverlapErrorResponse {
  error: string;
}

interface FireAvailabilityForMinistryParams {
  page: Page;
  cycleId: string;
  ministryId: string;
}

async function fireAvailabilityForMinistry({
  page,
  cycleId,
  ministryId,
}: FireAvailabilityForMinistryParams): Promise<void> {
  const participationResponse = await page.request.get(
    `${SERVER_URL}/api/v1/tailoring/cycles/${cycleId}/participation`,
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
    const fireResponse = await page.request.post(
      `${SERVER_URL}/api/v1/tailoring/participations/${eventView.participation.id}/fire-availability`,
    );
    expect(fireResponse.ok()).toBeTruthy();
  }
}

interface SetUpTwoMinistryOverlapCycleParams {
  page: Page;
  journey: VolunteerAvailabilityJourney;
}

// Builds one locked planning cycle, applies a single Sunday template block to
// both Worship and Care, and fires availability for every generated event in
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
    `${SERVER_URL}/api/v1/admin/planning-cycles`,
    {
      data: {
        name: CYCLE_NAME,
        startDate: journey.cycleWindow.startDate,
        endDate: journey.cycleWindow.endDate,
      },
    },
  );
  expect(cycleResponse.ok()).toBeTruthy();
  const cycle = (await cycleResponse.json()) as PlanningCycleResponse;

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
            order: 0,
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

  const worshipProfileResponse = await page.request.put(
    `${SERVER_URL}/api/v1/admin/ministries/${worshipMinistryId}/serving-profile`,
    {
      data: {
        entries: [
          {
            sourceTemplateBlockId: block.id,
            serves: true,
            shiftSplit: { kind: 'equal', count: 1 },
            headcounts: [
              { roleId: journey.ministries.worship.roles.usher.id, count: 1 },
            ],
          },
        ],
      },
    },
  );
  expect(worshipProfileResponse.ok()).toBeTruthy();

  const careProfileResponse = await page.request.put(
    `${SERVER_URL}/api/v1/admin/ministries/${careMinistryId}/serving-profile`,
    {
      data: {
        entries: [
          {
            sourceTemplateBlockId: block.id,
            serves: true,
            shiftSplit: { kind: 'equal', count: 1 },
            headcounts: [
              { roleId: journey.ministries.care.roles.careHost.id, count: 1 },
            ],
          },
        ],
      },
    },
  );
  expect(careProfileResponse.ok()).toBeTruthy();

  const applyResponse = await page.request.post(
    `${SERVER_URL}/api/v1/admin/planning-cycles/${cycle.id}/apply-templates`,
    { data: { templateIds: [template.id] } },
  );
  expect(applyResponse.ok()).toBeTruthy();

  const lockResponse = await page.request.post(
    `${SERVER_URL}/api/v1/admin/planning-cycles/${cycle.id}/lock`,
  );
  expect(lockResponse.ok()).toBeTruthy();

  await fireAvailabilityForMinistry({
    page,
    cycleId: cycle.id,
    ministryId: worshipMinistryId,
  });
  await fireAvailabilityForMinistry({
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
  // One check per ministry membership for the locked cycle: Worship (leader
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

  const marksResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/availability-checks/') &&
      response.url().endsWith('/marks') &&
      response.request().method() === 'PUT',
  );
  await shiftRows.first().getByTestId('mark-unavailable-toggle').click();
  await page.getByTestId('save-marks-button').click();
  const marksResponse = await marksResponsePromise;
  expect(marksResponse.ok()).toBeTruthy();
}

test('volunteer in two ministries is blocked by a cross-ministry overlap', async ({
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

  // VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE is OFF in this environment —
  // Unleash is unreachable from the local E2E stack, so
  // UnleashFeatureFlagService.isEnabled resolves every flag to false. The
  // overlap must therefore block the confirm (DL2-VA-05, FR-020).
  expect(confirmResponse.status()).toBe(409);
  const confirmError =
    (await confirmResponse.json()) as ConfirmOverlapErrorResponse;
  expect(confirmError.error).toBe('AVAILABILITY_OVERLAP');
  await expect(page.getByTestId('overlap-warning')).toBeVisible();

  // A single-ministry volunteer's clean confirm still exercises the
  // underlying availability-confirm flow, even though the leader-facing
  // verification that used to follow it is gone — see the note below.
  // Uses the team-leader persona, a member of Worship alone: the leader
  // belongs to both ministries and would hit the same overlap.
  const singleMinistryActorContext = await newPersonaContext({
    browser,
    persona: journey.personas.teamLeader,
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
  // tailoring workspace to check a per-volunteer Acknowledged/Not-looked
  // status list (`AvailabilityStatusSection`) showing this confirm next to
  // Grace Hopper's untouched check. That view was dropped when the old
  // event-card tailoring UI (`participation-tailoring.tsx`) was replaced
  // by the day-grouped workspace in commit a04911d and was never rebuilt
  // into the new UI — `availability-status-section.tsx` still exists but
  // is unused by any route. Restore this assertion once that leader-facing
  // view exists again.
});

test('volunteer in two ministries confirms an overlapping check when overlap-save is allowed', async ({
  page,
}, testInfo) => {
  test.fixme(
    true,
    'VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE cannot be toggled from this Playwright suite yet: Unleash is unreachable from the local E2E stack, so apps/server/src/infrastructure/services/unleash-feature-flag-service.ts silently resolves every flag to false and there is no per-test override for the real server process (the deterministic stub in apps/server/src/test-support/feature-flag-service-stub.ts only backs L1/L2 tests). Flip this to a real assertion once E2E gains a way to force the flag on for the server under test.',
  );

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

  // With the flag on, confirm succeeds and the cross-ministry conflict is
  // flagged to affected leaders instead of blocking the volunteer
  // (DL2-VA-06, FR-020, SC-007).
  expect(confirmResponse.status()).toBe(204);
  await expect(page.getByTestId('overlap-warning')).toHaveCount(0);
});
