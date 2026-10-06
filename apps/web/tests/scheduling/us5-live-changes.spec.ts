import { expect, type Page, test } from '@playwright/test';
import { requiredE2eUrl } from '../fixtures/e2e-urls';
import {
  type LiveChangesJourney,
  loadLiveChangesJourney,
} from '../fixtures/journeys/live-changes';
import {
  newPersonaContext,
  signInPersonaPage,
} from '../fixtures/journeys/rostering-church';

// DL4-US5 (P4, test-plan.md): a volunteer cancels their own published
// assignment — the leader is notified and the slot reopens (FR-028, SC-004,
// SC-008). A volunteer may not cancel someone else's assignment. A leader can
// then reassign a still-open assignment to a different volunteer mid-cycle
// (FR-029).
const SERVER_URL = requiredE2eUrl({ variable: 'VITE_SERVER_URL' });

const CYCLE_NAME = 'US5 Live Changes';

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

interface AssignmentIdResponse {
  id: string;
}

interface AssignmentResponse {
  assignment: AssignmentIdResponse;
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
  journey: LiveChangesJourney;
}

// Builds one locked Worship participation split into two shifts, each
// requiring one Usher — so the same volunteer can hold two distinct
// assignments (one to cancel, one to reassign) without tripping the
// same-shift duplicate-assignment guard.
async function setUpLiveChanges({
  page,
  journey,
}: SetUpLiveChangesParams): Promise<LiveChangesFixture> {
  const worshipMinistryId = journey.ministries.worship.id;
  const usherRoleId = journey.ministries.worship.roles.usher.id;

  const directionResponse = await page.request.patch(
    `${SERVER_URL}/api/v1/admin/ministries/${worshipMinistryId}/default-direction`,
    { data: { defaultDirection: 'all_out' } },
  );
  expect(directionResponse.ok()).toBeTruthy();

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
        name: 'US5 Live Changes Template',
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
    `${SERVER_URL}/api/v1/admin/ministries/${worshipMinistryId}/serving-profile`,
    {
      data: {
        entries: [
          {
            sourceTemplateBlockId: block.id,
            serves: true,
            shiftSplit: { kind: 'equal', count: 2 },
            headcounts: [{ roleId: usherRoleId, count: 1 }],
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
    `${SERVER_URL}/api/v1/tailoring/cycles/${cycle.id}/participation`,
    { params: { ministryId: worshipMinistryId } },
  );
  expect(participationResponse.ok()).toBeTruthy();
  const participation =
    (await participationResponse.json()) as CycleParticipationResponse;
  const eventView = participation.events[0];
  if (!eventView) {
    throw new Error('Expected one generated event for the live-changes cycle.');
  }

  const fireResponse = await page.request.post(
    `${SERVER_URL}/api/v1/tailoring/participations/${eventView.participation.id}/fire-availability`,
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

test('volunteer cancels their own published assignment, the leader is notified and the slot reopens, another volunteer cannot cancel it, and the leader reassigns mid-cycle', async ({
  browser,
  page,
}, testInfo) => {
  const journey = loadLiveChangesJourney({ testInfo });
  const { leader, owner: ownerPersona, teamLeader } = journey.personas;
  const usherRoleId = journey.ministries.worship.roles.usher.id;
  await signInPersonaPage({ page, persona: leader });
  const fixture = await setUpLiveChanges({ page, journey });

  const eligibleResponse = await page.request.get(
    `${SERVER_URL}/api/v1/rostering/shifts/${fixture.firstShiftId}/eligible-volunteers`,
  );
  expect(eligibleResponse.ok()).toBeTruthy();
  const eligible =
    (await eligibleResponse.json()) as EligibleVolunteerListResponse;
  const owner = eligible.volunteers.find(
    (volunteer) => volunteer.volunteerId === ownerPersona.volunteerId,
  );
  if (!owner) {
    throw new Error('Expected the owner persona to be eligible.');
  }

  const usherResponse = await page.request.post(
    `${SERVER_URL}/api/v1/rostering/shifts/${fixture.firstShiftId}/assignments`,
    { data: { volunteerId: owner.volunteerId, roleId: usherRoleId } },
  );
  expect(usherResponse.ok()).toBeTruthy();
  const usherAssignment = ((await usherResponse.json()) as AssignmentResponse)
    .assignment;

  const secondResponse = await page.request.post(
    `${SERVER_URL}/api/v1/rostering/shifts/${fixture.secondShiftId}/assignments`,
    { data: { volunteerId: owner.volunteerId, roleId: usherRoleId } },
  );
  expect(secondResponse.ok()).toBeTruthy();
  const secondAssignment = ((await secondResponse.json()) as AssignmentResponse)
    .assignment;

  const publishResponse = await page.request.post(
    `${SERVER_URL}/api/v1/rostering/participations/${fixture.participationId}/publish`,
    { data: {} },
  );
  expect(publishResponse.ok()).toBeTruthy();

  // Volunteer confirms the Usher assignment, then cancels it — the leader is
  // notified and the slot reopens (DL2-LC-01/03, FR-028, SC-008).
  const volunteerContext = await newPersonaContext({
    browser,
    persona: ownerPersona,
  });
  const volunteerPage = await volunteerContext.newPage();
  await volunteerPage.goto('/dashboard');

  // Find the group by its event title and toggle it open if collapsed.
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
    `${SERVER_URL}/api/v1/rostering/participations/${fixture.participationId}/completion`,
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
  const teamLeaderContext = await newPersonaContext({
    browser,
    persona: teamLeader,
  });
  const deniedCancelResponse = await teamLeaderContext.request.post(
    `${SERVER_URL}/api/v1/volunteer/assignments/${secondAssignment.id}/cancel`,
  );
  expect(deniedCancelResponse.status()).toBe(403);
  await teamLeaderContext.close();

  // The leader reassigns the still-open second Usher assignment mid-cycle
  // (DL2-RS-08, FR-029).
  const reassignResponse = await page.request.patch(
    `${SERVER_URL}/api/v1/rostering/assignments/${secondAssignment.id}/reassign`,
    {
      data: {
        volunteerId: teamLeader.volunteerId,
        reason: 'Original volunteer became unavailable mid-cycle',
      },
    },
  );
  expect(reassignResponse.ok()).toBeTruthy();
  const reassigned = (
    (await reassignResponse.json()) as ReassignedAssignmentResponse
  ).volunteerId;
  expect(reassigned).toBe(teamLeader.volunteerId);
});
