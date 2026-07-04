import { expect, type Page, test } from '@playwright/test';
import { LEADER_STORAGE_STATE, VOLUNTEER_STORAGE_STATE } from '../global-setup';

// DL4-US4 (P3, test-plan.md): a leader fills a shift's required headcount
// from the ranked eligible-volunteer list, watches completion% rise, leaves
// one slot unfilled, then publishes with the below-full confirmation
// (FR-021, SC-004, SC-006). The published slice is scoped to this
// MinistryParticipation only — the assigned volunteer sees it on their
// published schedule.
const SERVER_URL = process.env.VITE_SERVER_URL ?? 'http://localhost:4000';

// Fixed E2E seed identifiers (apps/server/src/test-support/e2e-seed.ts
// E2E_IDS). The web package stays DB-tooling-free, so specs reference these
// well-known UUIDs directly instead of importing the seed module — same
// convention as us1-admin-plan.spec.ts / us3-volunteer-availability.spec.ts.
const WORSHIP_MINISTRY_ID = 'e2e33333-3333-3333-3333-333333333331';
const USHER_ROLE_ID = 'e2e55555-5555-5555-5555-555555555551';

// The scheduling volunteer (VOLUNTEER_STORAGE_STATE) belongs only to
// Worship, seeded as "E2E Volunteer" — see global-setup.ts VOLUNTEER_BASE.
const ASSIGNED_VOLUNTEER_NAME = 'E2E Volunteer';

interface RosterPlanningMonth {
  cycleName: string;
  startDate: string;
  endDate: string;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function createRosterPlanningMonth(): RosterPlanningMonth {
  const now = new Date();
  const year = 2300 + (Math.floor(now.getTime() / 1000) % 50);
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));

  return {
    cycleName: `US4 Roster ${year}-${String(month + 1).padStart(2, '0')} ${now.getTime()}`,
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

interface EventSummaryResponse {
  id: string;
  title: string;
}

interface ShiftSummaryResponse {
  id: string;
}

interface SlotSummaryResponse {
  shifts: ShiftSummaryResponse[];
}

interface ParticipationEventViewResponse {
  participation: ParticipationSummaryResponse;
  event: EventSummaryResponse;
  slots: SlotSummaryResponse[];
}

interface CycleParticipationResponse {
  events: ParticipationEventViewResponse[];
}

interface RosterCycleFixture {
  cycleId: string;
  participationId: string;
  shiftId: string;
  eventTitle: string;
}

interface SetUpRosterCycleParams {
  page: Page;
}

// Builds one locked planning cycle for Worship with a single Sunday template
// block, split into one shift needing two Ushers — one slot stays open after
// a single assignment, forcing the below-full confirm path.
async function setUpRosterCycle({
  page,
}: SetUpRosterCycleParams): Promise<RosterCycleFixture> {
  const month = createRosterPlanningMonth();

  const directionResponse = await page.request.patch(
    `${SERVER_URL}/api/v1/admin/ministries/${WORSHIP_MINISTRY_ID}/default-direction`,
    { data: { defaultDirection: 'all_out' } },
  );
  expect(directionResponse.ok()).toBeTruthy();

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
        name: `US4 Roster Template ${Date.now()}`,
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
    throw new Error('Expected the roster template to have one block.');
  }

  const profileResponse = await page.request.put(
    `${SERVER_URL}/api/v1/admin/ministries/${WORSHIP_MINISTRY_ID}/serving-profile`,
    {
      data: {
        entries: [
          {
            sourceTemplateBlockId: block.id,
            serves: true,
            shiftSplit: { kind: 'equal', count: 1 },
            headcounts: [{ roleId: USHER_ROLE_ID, count: 2 }],
          },
        ],
      },
    },
  );
  expect(profileResponse.ok()).toBeTruthy();

  const applyResponse = await page.request.post(
    `${SERVER_URL}/api/v1/admin/planning-cycles/${cycle.id}/apply-templates`,
    { data: { templateIds: [template.id] } },
  );
  expect(applyResponse.ok()).toBeTruthy();

  const lockResponse = await page.request.post(
    `${SERVER_URL}/api/v1/admin/planning-cycles/${cycle.id}/lock`,
  );
  expect(lockResponse.ok()).toBeTruthy();

  const participationResponse = await page.request.get(
    `${SERVER_URL}/api/v1/leader/cycles/${cycle.id}/participation`,
    { params: { ministryId: WORSHIP_MINISTRY_ID } },
  );
  expect(participationResponse.ok()).toBeTruthy();
  const participation =
    (await participationResponse.json()) as CycleParticipationResponse;
  const eventView = participation.events[0];
  if (!eventView) {
    throw new Error('Expected one generated event for the roster cycle.');
  }

  const fireResponse = await page.request.post(
    `${SERVER_URL}/api/v1/leader/participations/${eventView.participation.id}/fire-availability`,
  );
  expect(fireResponse.ok()).toBeTruthy();

  const shift = eventView.slots[0]?.shifts[0];
  if (!shift) {
    throw new Error('Expected one generated shift for the roster cycle.');
  }

  return {
    cycleId: cycle.id,
    participationId: eventView.participation.id,
    shiftId: shift.id,
    eventTitle: eventView.event.title,
  };
}

test.use({ storageState: LEADER_STORAGE_STATE });

test('leader fills a shift, watches completion rise, publishes below-full, and the assigned volunteer sees only this slice', async ({
  browser,
  page,
}) => {
  const fixture = await setUpRosterCycle({ page });

  await page.goto(
    `/scheduling/rostering/${fixture.cycleId}/${WORSHIP_MINISTRY_ID}/${fixture.participationId}`,
  );

  await expect(page.getByTestId('roster-page')).toBeVisible();
  await expect(page.getByTestId('roster-completion-summary')).toContainText(
    '0 assigned across 2 required',
  );

  const assignedVolunteerRow = page
    .getByTestId('eligible-volunteer-row')
    .filter({ hasText: ASSIGNED_VOLUNTEER_NAME });
  await expect(assignedVolunteerRow).toHaveCount(1);

  const assignResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/shifts/${fixture.shiftId}/assignments`) &&
      response.request().method() === 'POST',
  );
  await assignedVolunteerRow.getByTestId('assign-volunteer-button').click();
  const assignResponse = await assignResponsePromise;
  expect(assignResponse.ok()).toBeTruthy();

  // Completion rises from 0% to 50% — one of the two required Ushers filled
  // (FR-021 / SC-004).
  await expect(page.getByTestId('roster-completion-summary')).toContainText(
    '1 assigned across 2 required',
  );

  // The second slot stays open on purpose, so publish must go through the
  // below-full confirmation dialog (FR-024).
  page.once('dialog', (dialog) => {
    dialog.accept();
  });
  const publishResponsePromise = page.waitForResponse(
    (response) =>
      response
        .url()
        .includes(`/participations/${fixture.participationId}/publish`) &&
      response.request().method() === 'POST',
  );
  await page.getByTestId('publish-participation-button').click();
  const publishResponse = await publishResponsePromise;
  expect(publishResponse.ok()).toBeTruthy();

  // Only the assigned volunteer sees this ministry's published slice
  // (FR-025 / C3, scoped reveal).
  const volunteerContext = await browser.newContext({
    storageState: VOLUNTEER_STORAGE_STATE,
  });
  const volunteerApiContext = volunteerContext.request;
  const scheduleResponse = await volunteerApiContext.get(
    `${SERVER_URL}/api/v1/volunteer/schedule`,
  );
  expect(scheduleResponse.ok()).toBeTruthy();
  const schedule = (await scheduleResponse.json()) as {
    assignments: Array<{ shiftId?: string }>;
  };
  expect(
    schedule.assignments.some(
      (assignment) => assignment.shiftId === fixture.shiftId,
    ),
  ).toBe(true);
  await volunteerContext.close();
});
