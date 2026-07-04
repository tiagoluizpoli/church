import { expect, type Page, test } from '@playwright/test';
import {
  LEADER_STORAGE_STATE,
  SUB_LEADER_STORAGE_STATE,
  VOLUNTEER_STORAGE_STATE,
} from '../global-setup';

// DL4-US5 (P4, test-plan.md): a volunteer cancels their own published
// assignment — the leader is notified and the slot reopens (FR-028, SC-004,
// SC-008). A volunteer may not cancel someone else's assignment. A leader can
// then reassign a still-open assignment to a different volunteer mid-cycle
// (FR-029).
const SERVER_URL = process.env.VITE_SERVER_URL ?? 'http://localhost:4000';

// Fixed E2E seed identifiers (apps/server/src/test-support/e2e-seed.ts
// E2E_IDS). The web package stays DB-tooling-free, so specs reference these
// well-known UUIDs directly — same convention as us1/us3/us4 specs.
const WORSHIP_MINISTRY_ID = 'e2e33333-3333-3333-3333-333333333331';
const USHER_ROLE_ID = 'e2e55555-5555-5555-5555-555555555551';
const SUB_LEADER_VOLUNTEER_ID = 'e2e44444-4444-4444-4444-444444444446';

// VOLUNTEER_STORAGE_STATE's volunteer belongs to Worship, seeded as
// "E2E Volunteer". SUB_LEADER_STORAGE_STATE's volunteer ("E2E Sub-Leader",
// SUB_LEADER_VOLUNTEER_ID) is a distinct real logged-in volunteer also in
// Worship (team1 sub-leader) — used for the cross-volunteer permission check
// and as the leader's reassign target.
const OWNER_VOLUNTEER_NAME = 'E2E Volunteer';

interface LiveChangesMonth {
  cycleName: string;
  startDate: string;
  endDate: string;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function createLiveChangesMonth(): LiveChangesMonth {
  const now = new Date();
  const year = 2350 + (Math.floor(now.getTime() / 1000) % 50);
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));

  return {
    cycleName: `US5 Live Changes ${year}-${String(month + 1).padStart(2, '0')} ${now.getTime()}`,
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

interface AssignmentResponse {
  assignment: { id: string };
}

interface EligibleVolunteerResponse {
  volunteerId: string;
  volunteerName: string;
}

interface EligibleVolunteerListResponse {
  volunteers: EligibleVolunteerResponse[];
}

interface CompletionResponse {
  assignedCount: number;
  requiredCount: number;
}

interface NotificationSummaryResponse {
  type: string;
}

interface NotificationListResponse {
  items: NotificationSummaryResponse[];
}

interface ReassignedAssignmentResponse {
  volunteerId: string;
}

interface LiveChangesFixture {
  participationId: string;
  firstShiftId: string;
  secondShiftId: string;
  eventTitle: string;
}

interface SetUpLiveChangesParams {
  page: Page;
}

// Builds one locked Worship participation split into two shifts, each
// requiring one Usher — so the same volunteer can hold two distinct
// assignments (one to cancel, one to reassign) without tripping the
// same-shift duplicate-assignment guard.
async function setUpLiveChanges({
  page,
}: SetUpLiveChangesParams): Promise<LiveChangesFixture> {
  const month = createLiveChangesMonth();

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
        name: `US5 Live Changes Template ${Date.now()}`,
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
    throw new Error('Expected the live-changes template to have one block.');
  }

  const profileResponse = await page.request.put(
    `${SERVER_URL}/api/v1/admin/ministries/${WORSHIP_MINISTRY_ID}/serving-profile`,
    {
      data: {
        entries: [
          {
            sourceTemplateBlockId: block.id,
            serves: true,
            shiftSplit: { kind: 'equal', count: 2 },
            headcounts: [{ roleId: USHER_ROLE_ID, count: 1 }],
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
    throw new Error('Expected one generated event for the live-changes cycle.');
  }

  const fireResponse = await page.request.post(
    `${SERVER_URL}/api/v1/leader/participations/${eventView.participation.id}/fire-availability`,
  );
  expect(fireResponse.ok()).toBeTruthy();

  const shifts = eventView.slots[0]?.shifts ?? [];
  const [firstShift, secondShift] = shifts;
  if (!firstShift || !secondShift) {
    throw new Error(
      'Expected two generated shifts for the live-changes cycle.',
    );
  }

  return {
    participationId: eventView.participation.id,
    firstShiftId: firstShift.id,
    secondShiftId: secondShift.id,
    eventTitle: eventView.event.title,
  };
}

test.use({ storageState: LEADER_STORAGE_STATE });

test('volunteer cancels their own published assignment, the leader is notified and the slot reopens, another volunteer cannot cancel it, and the leader reassigns mid-cycle', async ({
  browser,
  page,
}) => {
  const fixture = await setUpLiveChanges({ page });

  const eligibleResponse = await page.request.get(
    `${SERVER_URL}/api/v1/leader/shifts/${fixture.firstShiftId}/eligible-volunteers`,
  );
  expect(eligibleResponse.ok()).toBeTruthy();
  const eligible =
    (await eligibleResponse.json()) as EligibleVolunteerListResponse;
  const owner = eligible.volunteers.find(
    (volunteer) => volunteer.volunteerName === OWNER_VOLUNTEER_NAME,
  );
  if (!owner) {
    throw new Error('Expected the scheduling volunteer to be eligible.');
  }

  const usherResponse = await page.request.post(
    `${SERVER_URL}/api/v1/leader/shifts/${fixture.firstShiftId}/assignments`,
    { data: { volunteerId: owner.volunteerId, roleId: USHER_ROLE_ID } },
  );
  expect(usherResponse.ok()).toBeTruthy();
  const usherAssignment = ((await usherResponse.json()) as AssignmentResponse)
    .assignment;

  const secondResponse = await page.request.post(
    `${SERVER_URL}/api/v1/leader/shifts/${fixture.secondShiftId}/assignments`,
    { data: { volunteerId: owner.volunteerId, roleId: USHER_ROLE_ID } },
  );
  expect(secondResponse.ok()).toBeTruthy();
  const secondAssignment = ((await secondResponse.json()) as AssignmentResponse)
    .assignment;

  const publishResponse = await page.request.post(
    `${SERVER_URL}/api/v1/leader/participations/${fixture.participationId}/publish`,
    { data: {} },
  );
  expect(publishResponse.ok()).toBeTruthy();

  // Volunteer confirms the Usher assignment, then cancels it — the leader is
  // notified and the slot reopens (DL2-LC-01/03, FR-028, SC-008).
  const volunteerContext = await browser.newContext({
    storageState: VOLUNTEER_STORAGE_STATE,
  });
  const volunteerPage = await volunteerContext.newPage();
  await volunteerPage.goto('/dashboard');

  // Other specs running in parallel may seed their own assignment groups for
  // this shared volunteer, so only one of them auto-expands on load — find
  // ours by its unique event title and toggle it open if collapsed.
  const groupToggle = volunteerPage.getByRole('button', {
    name: new RegExp(
      `^(?:Show|Hide) assignments for ${fixture.eventTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
    ),
  });
  await expect(groupToggle).toBeVisible();
  if (/^Show/.test((await groupToggle.textContent()) ?? '')) {
    await groupToggle.click();
  }
  await expect(
    volunteerPage.getByRole('button', {
      name: `Hide assignments for ${fixture.eventTitle}`,
    }),
  ).toBeVisible();

  const groupContainer = volunteerPage
    .locator('div.border.p-3')
    .filter({ has: groupToggle });
  const usherRow = groupContainer
    .locator('div.space-y-3.border.px-3.py-2')
    .first();
  const confirmResponsePromise = volunteerPage.waitForResponse(
    (response) =>
      response.url().includes(`/assignments/${usherAssignment.id}`) &&
      response.request().method() === 'PATCH',
  );
  await usherRow.getByRole('button', { name: 'Confirm' }).click();
  const confirmResponse = await confirmResponsePromise;
  expect(confirmResponse.ok()).toBeTruthy();

  const cancelResponsePromise = volunteerPage.waitForResponse(
    (response) =>
      response.url().includes(`/assignments/${usherAssignment.id}/cancel`) &&
      response.request().method() === 'POST',
  );
  await groupContainer.getByTestId('cancel-assignment-button').click();
  const cancelResponse = await cancelResponsePromise;
  expect(cancelResponse.status()).toBe(204);
  await volunteerContext.close();

  // The Usher slot reopens — completion drops from 2/2 to 1/2 (DL2-LC-01/03).
  const completionResponse = await page.request.get(
    `${SERVER_URL}/api/v1/leader/participations/${fixture.participationId}/completion`,
  );
  expect(completionResponse.ok()).toBeTruthy();
  const completion = (await completionResponse.json()) as CompletionResponse;
  expect(completion.requiredCount).toBe(2);
  expect(completion.assignedCount).toBe(1);

  // The leader (also a volunteer profile) was notified of the cancellation.
  const notificationsResponse = await page.request.get(
    `${SERVER_URL}/api/v1/volunteer/notifications`,
  );
  expect(notificationsResponse.ok()).toBeTruthy();
  const notifications =
    (await notificationsResponse.json()) as NotificationListResponse;
  expect(
    notifications.items.some((item) => item.type === 'assignment_removed'),
  ).toBe(true);

  // A different volunteer cannot cancel the still-open second Usher assignment
  // (DL2-LC-02, SC-004).
  const subLeaderContext = await browser.newContext({
    storageState: SUB_LEADER_STORAGE_STATE,
  });
  const deniedCancelResponse = await subLeaderContext.request.post(
    `${SERVER_URL}/api/v1/volunteer/assignments/${secondAssignment.id}/cancel`,
  );
  expect(deniedCancelResponse.status()).toBe(403);
  await subLeaderContext.close();

  // The leader reassigns the still-open second Usher assignment mid-cycle
  // (DL2-RS-08, FR-029).
  const reassignResponse = await page.request.patch(
    `${SERVER_URL}/api/v1/leader/assignments/${secondAssignment.id}/reassign`,
    {
      data: {
        volunteerId: SUB_LEADER_VOLUNTEER_ID,
        reason: 'Original volunteer became unavailable mid-cycle',
      },
    },
  );
  expect(reassignResponse.ok()).toBeTruthy();
  const reassigned = (
    (await reassignResponse.json()) as ReassignedAssignmentResponse
  ).volunteerId;
  expect(reassigned).toBe(SUB_LEADER_VOLUNTEER_ID);
});
