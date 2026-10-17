import { expect, type Page, test } from '@playwright/test';
import { requiredE2eUrl } from '@/tests/fixtures/e2e-urls';
import { signInPersonaPage } from '@/tests/fixtures/journeys/assign-church';
import {
  type LiveChangesJourney,
  loadLiveChangesJourney,
} from '@/tests/fixtures/journeys/live-changes';

// DL4-US5 (P4, test-plan.md): a leader reassigns a still-open assignment to a
// different volunteer mid-cycle (FR-029).
const SERVER_URL = requiredE2eUrl({ variable: 'VITE_SERVER_URL' });

const CYCLE_NAME = 'US5 Live Changes';

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

interface EventSummaryResponse {
  id: string;
  title: string;
}

interface ShiftSummaryResponse {
  id: string;
  requirements: { id: string; roleId: string }[];
}

interface EventTimeBlockSummaryResponse {
  shifts: ShiftSummaryResponse[];
  requirements: { id: string; shiftId: string; roleId: string }[];
}

interface ParticipationEventViewResponse {
  participation: ParticipationSummaryResponse;
  event: EventSummaryResponse;
  eventTimeBlocks: EventTimeBlockSummaryResponse[];
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
  firstRequirementId: string;
  secondRequirementId: string;
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
  const stageSectorId = journey.ministries.worship.sectors.stage.id;

  const directionResponse = await page.request.patch(
    `${SERVER_URL}/api/v1/admin/ministries/${worshipMinistryId}/default-direction`,
    { data: { defaultDirection: 'all_out' } },
  );
  expect(directionResponse.ok()).toBeTruthy();

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

  const usualSetupResponse = await page.request.put(
    `${SERVER_URL}/api/v1/admin/ministries/${worshipMinistryId}/usual-setup`,
    {
      data: {
        entries: [
          {
            sourceTemplateTimeBlockId: block.id,
            serves: true,
            shiftSplit: { kind: 'equal', count: 2 },
            headcounts: [
              { sectorId: stageSectorId, roleId: usherRoleId, peopleNeeded: 1 },
            ],
          },
        ],
      },
    },
  );
  expect(usualSetupResponse.ok()).toBeTruthy();

  const applyResponse = await page.request.post(
    `${SERVER_URL}/api/v1/admin/cycles/${cycle.id}/apply-templates`,
    { data: { templateIds: [template.id] } },
  );
  expect(applyResponse.ok()).toBeTruthy();

  const sendResponse = await page.request.post(
    `${SERVER_URL}/api/v1/admin/cycles/${cycle.id}/send`,
  );
  expect(sendResponse.ok()).toBeTruthy();

  const participationResponse = await page.request.get(
    `${SERVER_URL}/api/v1/prepare/cycles/${cycle.id}/participation`,
    { params: { ministryId: worshipMinistryId } },
  );
  expect(participationResponse.ok()).toBeTruthy();
  const participation =
    (await participationResponse.json()) as CycleParticipationResponse;
  const eventView = participation.events[0];
  if (!eventView) {
    throw new Error('Expected one generated event for the live-changes cycle.');
  }

  const requestResponse = await page.request.post(
    `${SERVER_URL}/api/v1/prepare/participations/${eventView.participation.id}/ask-availability`,
  );
  expect(requestResponse.ok()).toBeTruthy();

  const shifts = eventView.eventTimeBlocks[0]?.shifts ?? [];
  const [firstShift, secondShift] = shifts;
  if (!firstShift || !secondShift) {
    throw new Error(
      'Expected two generated shifts for the live-changes cycle.',
    );
  }
  const requirements = eventView.eventTimeBlocks[0]?.requirements ?? [];
  const firstRequirement = requirements.find(
    ({ shiftId, roleId }) =>
      shiftId === firstShift.id &&
      roleId === journey.ministries.worship.roles.usher.id,
  );
  const secondRequirement = requirements.find(
    ({ shiftId, roleId }) =>
      shiftId === secondShift.id &&
      roleId === journey.ministries.worship.roles.usher.id,
  );
  if (!firstRequirement || !secondRequirement) {
    throw new Error('Expected an Usher requirement for each generated shift.');
  }

  return {
    cycleId: cycle.id,
    firstShiftId: firstShift.id,
    secondShiftId: secondShift.id,
    firstRequirementId: firstRequirement.id,
    secondRequirementId: secondRequirement.id,
  };
}

test('the leader reassigns a still-open assignment mid-cycle', async ({
  page,
}, testInfo) => {
  const journey = loadLiveChangesJourney({ testInfo });
  const { leader, owner: ownerPersona, volunteer } = journey.personas;
  await signInPersonaPage({ page, persona: leader });
  const fixture = await setUpLiveChanges({ page, journey });

  const eligibleResponse = await page.request.get(
    `${SERVER_URL}/api/v1/assign/shifts/${fixture.firstShiftId}/eligible-volunteers`,
  );
  expect(eligibleResponse.ok()).toBeTruthy();
  const eligible =
    (await eligibleResponse.json()) as EligibleVolunteerListResponse;
  const owner = eligible.volunteers.find(
    (candidate) => candidate.volunteerId === ownerPersona.volunteerId,
  );
  if (!owner) {
    throw new Error('Expected the owner persona to be eligible.');
  }

  // Both shifts are staffed so the publish is a full one.
  const firstResponse = await page.request.post(
    `${SERVER_URL}/api/v1/assign/shifts/${fixture.firstShiftId}/assignments`,
    {
      data: {
        volunteerId: owner.volunteerId,
        shiftRequirementId: fixture.firstRequirementId,
      },
    },
  );
  expect(firstResponse.ok()).toBeTruthy();

  const secondResponse = await page.request.post(
    `${SERVER_URL}/api/v1/assign/shifts/${fixture.secondShiftId}/assignments`,
    {
      data: {
        volunteerId: owner.volunteerId,
        shiftRequirementId: fixture.secondRequirementId,
      },
    },
  );
  expect(secondResponse.ok()).toBeTruthy();
  const secondAssignment = ((await secondResponse.json()) as AssignmentResponse)
    .assignment;

  const publishResponse = await page.request.post(
    `${SERVER_URL}/api/v1/assign/cycles/${fixture.cycleId}/publish`,
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
    `${SERVER_URL}/api/v1/assign/assignments/${secondAssignment.id}/reassign`,
    {
      data: { volunteerId: volunteer.volunteerId },
    },
  );
  expect(reassignResponse.ok()).toBeTruthy();
  const reassigned = (
    (await reassignResponse.json()) as ReassignedAssignmentResponse
  ).volunteerId;
  expect(reassigned).toBe(volunteer.volunteerId);
});
