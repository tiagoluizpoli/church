import { expect, type Page, test } from '@playwright/test';
import { LEADER_STORAGE_STATE, VOLUNTEER_STORAGE_STATE } from '../global-setup';

// DL4-US3 (P2, test-plan.md): a volunteer who belongs to two ministries opens
// their availability checks (one per ministry for the locked cycle), marks a
// shift unavailable on one check, then confirms a check that has a
// cross-ministry, same-date shift overlap. The confirm outcome depends on the
// VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE flag (FR-020, SC-007). The leader
// also sees per-volunteer acknowledgement state on the tailoring page.
const SERVER_URL = process.env.VITE_SERVER_URL ?? 'http://localhost:4000';

// Fixed E2E seed identifiers (apps/server/src/test-support/e2e-seed.ts
// E2E_IDS). The web package stays DB-tooling-free, so specs reference these
// well-known UUIDs directly instead of importing the seed module — same
// convention as smoke.spec.ts / a11y-builder.spec.ts.
const WORSHIP_MINISTRY_ID = 'e2e33333-3333-3333-3333-333333333331';
const CARE_MINISTRY_ID = 'e2e33333-3333-3333-3333-333333333332';
const USHER_ROLE_ID = 'e2e55555-5555-5555-5555-555555555551';
const CARE_HOST_ROLE_ID = 'e2e55555-5555-5555-5555-555555555553';

// Display names seeded by global-setup.ts / e2e-seed.ts. The scheduling
// volunteer belongs only to Worship, so their check can never conflict with a
// second ministry — a clean confirm proves the leader's "Acknowledged" state.
// Grace Hopper (pool volunteer) never touches her check, proving "Not
// looked".
const CLEAN_CONFIRM_VOLUNTEER_NAME = 'E2E Volunteer';
const UNTOUCHED_VOLUNTEER_NAME = 'Grace Hopper';

interface OverlapPlanningMonth {
  cycleName: string;
  startDate: string;
  endDate: string;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function createOverlapPlanningMonth(): OverlapPlanningMonth {
  const now = new Date();
  const year = 2200 + (Math.floor(now.getTime() / 1000) % 50);
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));

  return {
    cycleName: `US3 Overlap ${year}-${String(month + 1).padStart(2, '0')} ${now.getTime()}`,
    startDate: toDateString(start),
    endDate: toDateString(end),
  };
}

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
    `${SERVER_URL}/api/v1/leader/cycles/${cycleId}/participation`,
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
      `${SERVER_URL}/api/v1/leader/participations/${eventView.participation.id}/fire-availability`,
    );
    expect(fireResponse.ok()).toBeTruthy();
  }
}

interface SetUpTwoMinistryOverlapCycleParams {
  page: Page;
}

interface TwoMinistryOverlapCycle {
  cycleId: string;
  cycleName: string;
}

// Builds one locked planning cycle, applies a single Sunday template block to
// both Worship and Care, and fires availability for every generated event in
// both ministries. Because both ministries split the shared template block
// with an equal-1 shift, every Sunday produces a same-date, same-time shift
// pair across the two ministries — a guaranteed cross-ministry overlap for
// FR-020 (DL2-VA-05/06).
async function setUpTwoMinistryOverlapCycle({
  page,
}: SetUpTwoMinistryOverlapCycleParams): Promise<TwoMinistryOverlapCycle> {
  const month = createOverlapPlanningMonth();

  const worshipDirectionResponse = await page.request.patch(
    `${SERVER_URL}/api/v1/admin/ministries/${WORSHIP_MINISTRY_ID}/default-direction`,
    { data: { defaultDirection: 'all_out' } },
  );
  expect(worshipDirectionResponse.ok()).toBeTruthy();

  const careDirectionResponse = await page.request.patch(
    `${SERVER_URL}/api/v1/admin/ministries/${CARE_MINISTRY_ID}/default-direction`,
    { data: { defaultDirection: 'all_out' } },
  );
  expect(careDirectionResponse.ok()).toBeTruthy();

  const cycleResponse = await page.request.post(
    `${SERVER_URL}/api/v1/admin/planning-cycles`,
    {
      data: {
        name: month.cycleName,
        startDate: month.startDate,
        endDate: month.endDate,
      },
    },
  );
  expect(cycleResponse.ok()).toBeTruthy();
  const cycle = (await cycleResponse.json()) as PlanningCycleResponse;

  const templateResponse = await page.request.post(
    `${SERVER_URL}/api/v1/admin/event-templates`,
    {
      data: {
        name: `US3 Overlap Template ${Date.now()}`,
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
    `${SERVER_URL}/api/v1/admin/ministries/${WORSHIP_MINISTRY_ID}/serving-profile`,
    {
      data: {
        entries: [
          {
            sourceTemplateBlockId: block.id,
            serves: true,
            shiftSplit: { kind: 'equal', count: 1 },
            headcounts: [{ roleId: USHER_ROLE_ID, count: 1 }],
          },
        ],
      },
    },
  );
  expect(worshipProfileResponse.ok()).toBeTruthy();

  const careProfileResponse = await page.request.put(
    `${SERVER_URL}/api/v1/admin/ministries/${CARE_MINISTRY_ID}/serving-profile`,
    {
      data: {
        entries: [
          {
            sourceTemplateBlockId: block.id,
            serves: true,
            shiftSplit: { kind: 'equal', count: 1 },
            headcounts: [{ roleId: CARE_HOST_ROLE_ID, count: 1 }],
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
    ministryId: WORSHIP_MINISTRY_ID,
  });
  await fireAvailabilityForMinistry({
    page,
    cycleId: cycle.id,
    ministryId: CARE_MINISTRY_ID,
  });

  return {
    cycleId: cycle.id,
    cycleName: month.cycleName,
  };
}

interface OpenWorshipCheckAndMarkOneShiftUnavailableParams {
  page: Page;
  cycleName: string;
}

async function openWorshipCheckAndMarkOneShiftUnavailable({
  page,
  cycleName,
}: OpenWorshipCheckAndMarkOneShiftUnavailableParams): Promise<void> {
  await page.goto('/volunteer/availability');

  await expect(page.getByTestId('availability-check-list')).toBeVisible();
  // One check per ministry membership for the locked cycle: Worship (leader
  // membership) and Care (volunteer membership). Scoped by ministry name AND
  // this test's own (uniquely-named) cycle — the dashboard lists pending
  // checks across every cycle, and an unrelated spec (us2-leader-tailor also
  // fires availability for the Worship ministry, in its own cycle) can leave
  // an extra same-ministry card that a ministry-only filter wouldn't exclude.
  const worshipCard = page
    .getByTestId('availability-check-card')
    .filter({ hasText: 'E2E Worship' })
    .filter({ hasText: cycleName });
  await expect(worshipCard).toHaveCount(1);

  const careCard = page
    .getByTestId('availability-check-card')
    .filter({ hasText: 'E2E Care' })
    .filter({ hasText: cycleName });
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

test.use({ storageState: LEADER_STORAGE_STATE });

test('volunteer in two ministries is blocked by a cross-ministry overlap and the leader sees acknowledgement state', async ({
  browser,
  page,
}) => {
  const { cycleId, cycleName } = await setUpTwoMinistryOverlapCycle({ page });

  await openWorshipCheckAndMarkOneShiftUnavailable({ page, cycleName });

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

  // A single-ministry volunteer can never hit the overlap policy — their
  // clean confirm demonstrates the leader's "Acknowledged" state below,
  // while Grace Hopper's never-opened check demonstrates "Not looked".
  const volunteerContext = await browser.newContext({
    storageState: VOLUNTEER_STORAGE_STATE,
  });
  const volunteerPage = await volunteerContext.newPage();
  await volunteerPage.goto('/volunteer/availability');

  const cleanVolunteerCard = volunteerPage
    .getByTestId('availability-check-card')
    .filter({ hasText: cycleName })
    .filter({ hasText: 'E2E Worship' });
  await expect(cleanVolunteerCard).toHaveCount(1);
  await cleanVolunteerCard.click();
  await expect(
    volunteerPage.getByTestId('availability-check-detail'),
  ).toBeVisible();

  const volunteerConfirmResponsePromise = volunteerPage.waitForResponse(
    (response) =>
      response.url().includes('/availability-checks/') &&
      response.url().endsWith('/confirm') &&
      response.request().method() === 'POST',
  );
  await volunteerPage.getByTestId('confirm-availability-button').click();
  const volunteerConfirmResponse = await volunteerConfirmResponsePromise;
  expect(volunteerConfirmResponse.status()).toBe(204);
  await volunteerContext.close();

  await page.goto('/scheduling/tailoring');
  await page.getByTestId('tailoring-ministry-select').click();
  await page
    .getByTestId(`tailoring-ministry-option-${WORSHIP_MINISTRY_ID}`)
    .click();
  await page.getByTestId('tailoring-cycle-select').click();
  await page.getByTestId(`tailoring-cycle-option-${cycleId}`).click();

  const statusList = page.getByTestId('availability-status-list');
  await expect(statusList).toBeVisible();

  const acknowledgedRow = statusList
    .getByTestId('availability-status-row')
    .filter({ hasText: CLEAN_CONFIRM_VOLUNTEER_NAME });
  await expect(acknowledgedRow).toContainText('Acknowledged');

  const pendingRow = statusList
    .getByTestId('availability-status-row')
    .filter({ hasText: UNTOUCHED_VOLUNTEER_NAME });
  await expect(pendingRow).toContainText('Not looked');
});

test('volunteer in two ministries confirms an overlapping check when overlap-save is allowed', async ({
  page,
}) => {
  test.fixme(
    true,
    'VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE cannot be toggled from this Playwright suite yet: Unleash is unreachable from the local E2E stack, so apps/server/src/infrastructure/services/unleash-feature-flag-service.ts silently resolves every flag to false and there is no per-test override for the real server process (the deterministic stub in apps/server/src/test-support/feature-flag-service-stub.ts only backs L1/L2 tests). Flip this to a real assertion once E2E gains a way to force the flag on for the server under test.',
  );

  const { cycleName } = await setUpTwoMinistryOverlapCycle({ page });
  await openWorshipCheckAndMarkOneShiftUnavailable({ page, cycleName });

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
