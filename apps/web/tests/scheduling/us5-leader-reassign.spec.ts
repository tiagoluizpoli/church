import { expect, type Page, test } from '@playwright/test';
import { requiredE2eUrl } from '../fixtures/e2e-urls';
import {
  type LiveChangesJourney,
  loadLiveChangesJourney,
} from '../fixtures/journeys/live-changes';
import { signInPersonaPage } from '../fixtures/journeys/rostering-church';

// DL4-US5 (P4, test-plan.md): a leader reassigns a still-open assignment to a
// different volunteer mid-cycle (FR-029).
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

interface ReassignedAssignmentResponse {
  volunteerId: string;
}

interface LiveChangesFixture {
  cycleId: string;
  firstShiftId: string;
  secondShiftId: string;
}

interface SetUpLiveChangesParams {
  page: Page;
  journey: LiveChangesJourney;
}

// Builds one locked Worship participation split into two shifts, each
// requiring one Usher.
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
    cycleId: cycle.id,
    firstShiftId: firstShift.id,
    secondShiftId: secondShift.id,
  };
}

test('the leader reassigns a still-open assignment mid-cycle', async ({
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

  // Both shifts are staffed so the publish is a full one.
  const firstResponse = await page.request.post(
    `${SERVER_URL}/api/v1/rostering/shifts/${fixture.firstShiftId}/assignments`,
    { data: { volunteerId: owner.volunteerId, roleId: usherRoleId } },
  );
  expect(firstResponse.ok()).toBeTruthy();

  const secondResponse = await page.request.post(
    `${SERVER_URL}/api/v1/rostering/shifts/${fixture.secondShiftId}/assignments`,
    { data: { volunteerId: owner.volunteerId, roleId: usherRoleId } },
  );
  expect(secondResponse.ok()).toBeTruthy();
  const secondAssignment = ((await secondResponse.json()) as AssignmentResponse)
    .assignment;

  const publishResponse = await page.request.post(
    `${SERVER_URL}/api/v1/rostering/cycles/${fixture.cycleId}/publish`,
    {
      params: { ministryId: journey.ministries.worship.id },
      data: {},
    },
  );
  expect(publishResponse.ok()).toBeTruthy();
  // Cycle publish answers 200 even when it refuses below-full, so check it published.
  expect(await publishResponse.json()).toMatchObject({ published: true });

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
