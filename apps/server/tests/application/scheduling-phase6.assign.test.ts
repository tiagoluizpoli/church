import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createSchedulingManagers,
  seedRequirement,
  seedRole,
  seedRoleQualification,
  seedShift,
  seedVolunteerMembership,
} from './scheduling-schedule.helpers';
import {
  ChurchId,
  CycleId,
  MinistryId,
  MinistryParticipationId,
  ShiftId,
  ShiftRequirementId,
  UserId,
  VolunteerId,
} from '@/domain/branded-ids';
import { buildMinistry, buildSector } from '@/seeds/builders/ministry';
import {
  buildAssignment,
  buildMinistryParticipation,
} from '@/seeds/builders/scheduling';
import {
  buildAvailabilityCheck,
  buildUnavailableShift,
} from '@/seeds/builders/unavailable-shift';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

interface SeedSectorInput {
  churchId: string;
  ministryId: string;
  name: string;
}

async function seedSector(input: SeedSectorInput) {
  return await buildSector({ db: schedulingTestDb, ...input });
}

interface SeedUnavailableShiftInput {
  churchId: string;
  cycleId: string;
  membershipId: string;
  shiftId: string;
}

async function seedUnavailableShift(input: SeedUnavailableShiftInput) {
  const check = await buildAvailabilityCheck({
    db: schedulingTestDb,
    churchId: input.churchId,
    cycleId: input.cycleId,
    ministryMembershipId: input.membershipId,
    state: 'pending',
  });

  await buildUnavailableShift({
    db: schedulingTestDb,
    churchId: input.churchId,
    availabilityCheckId: check.id,
    shiftId: input.shiftId,
  });
}

interface SeedAssignmentInput {
  churchId: string;
  participationId: string;
  shiftId: string;
  volunteerId: string;
  roleId: string;
  shiftRequirementId: string;
  status?: 'draft' | 'pending' | 'confirmed' | 'declined' | 'cancelled';
}

async function seedAssignment(input: SeedAssignmentInput) {
  return await buildAssignment({
    db: schedulingTestDb,
    ...input,
    status: input.status ?? 'pending',
  });
}

describe('Phase 6 assign and publish managers (US4)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('DL2-RS-01/02 ranks eligible volunteers by availability, least-recent service, then stable name', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'August 2026',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-09-01T00:00:00.000Z'),
      state: 'sent',
    });
    const upcoming = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Schedule target',
      start: new Date('2026-08-10T09:00:00.000Z'),
      end: new Date('2026-08-10T11:00:00.000Z'),
      status: 'scheduled',
    });
    const history = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Earlier service',
      start: new Date('2026-08-03T09:00:00.000Z'),
      end: new Date('2026-08-03T11:00:00.000Z'),
      status: 'scheduled',
    });
    const roleRow = await seedRole({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Usher',
    });
    const targetShift = await seedShift({
      churchId: seed.churchAId,
      participationId: upcoming.participation.id,
      eventTimeBlockId: upcoming.eventTimeBlock.id,
      startTime: new Date('2026-08-10T09:00:00.000Z'),
      endTime: new Date('2026-08-10T10:00:00.000Z'),
      label: 'Target shift',
    });
    const oldShift = await seedShift({
      churchId: seed.churchAId,
      participationId: history.participation.id,
      eventTimeBlockId: history.eventTimeBlock.id,
      startTime: new Date('2026-08-03T09:00:00.000Z'),
      endTime: new Date('2026-08-03T10:00:00.000Z'),
      label: 'Older shift',
    });
    const recentShift = await seedShift({
      churchId: seed.churchAId,
      participationId: history.participation.id,
      eventTimeBlockId: history.eventTimeBlock.id,
      startTime: new Date('2026-08-03T10:00:00.000Z'),
      endTime: new Date('2026-08-03T11:00:00.000Z'),
      label: 'Recent shift',
    });
    await seedRequirement({
      churchId: seed.churchAId,
      participationId: upcoming.participation.id,
      shiftId: targetShift.id,
      roleId: roleRow.id,
      peopleNeeded: 1,
    });

    const ada = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Ada Lovelace',
      email: 'ada-phase6@test.com',
    });
    const grace = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Grace Hopper',
      email: 'grace-phase6@test.com',
    });
    const alan = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Alan Turing',
      email: 'alan-phase6@test.com',
    });
    await seedRoleQualification({
      churchId: seed.churchAId,
      membershipId: ada.membership.id,
      roleId: roleRow.id,
    });
    await seedRoleQualification({
      churchId: seed.churchAId,
      membershipId: grace.membership.id,
      roleId: roleRow.id,
    });
    await seedRoleQualification({
      churchId: seed.churchAId,
      membershipId: alan.membership.id,
      roleId: roleRow.id,
    });

    const oldShiftRequirement = await seedRequirement({
      churchId: seed.churchAId,
      participationId: history.participation.id,
      shiftId: oldShift.id,
      roleId: roleRow.id,
      peopleNeeded: 1,
    });
    const recentShiftRequirement = await seedRequirement({
      churchId: seed.churchAId,
      participationId: history.participation.id,
      shiftId: recentShift.id,
      roleId: roleRow.id,
      peopleNeeded: 1,
    });

    await seedAssignment({
      churchId: seed.churchAId,
      participationId: history.participation.id,
      shiftId: oldShift.id,
      shiftRequirementId: oldShiftRequirement.id,
      volunteerId: ada.volunteer.id,
      roleId: roleRow.id,
      status: 'confirmed',
    });
    await seedAssignment({
      churchId: seed.churchAId,
      participationId: history.participation.id,
      shiftId: recentShift.id,
      shiftRequirementId: recentShiftRequirement.id,
      volunteerId: grace.volunteer.id,
      roleId: roleRow.id,
      status: 'confirmed',
    });
    await seedUnavailableShift({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      membershipId: alan.membership.id,
      shiftId: targetShift.id,
    });

    const { participationManager } = createSchedulingManagers();
    const eligible = await participationManager.listEligibleVolunteers({
      churchId: ChurchId.from(seed.churchAId),
      shiftId: ShiftId.from(targetShift.id),
    });

    expect(eligible.map((item) => item.volunteerName)).toEqual([
      'Ada Lovelace',
      'Grace Hopper',
      'Alan Turing',
    ]);
    expect(eligible.map((item) => item.isAvailable)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('DL2-RS-03/04/05/06/09 creates participation assignments on the requested shift, updates completion, and refuses an overlapping assignment', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'September 2026',
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-10-01T00:00:00.000Z'),
      state: 'sent',
    });
    const primary = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Primary service',
      start: new Date('2026-09-07T09:00:00.000Z'),
      end: new Date('2026-09-07T11:00:00.000Z'),
      status: 'scheduled',
    });
    const overlapBranch = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Overlap branch',
      start: new Date('2026-09-07T09:30:00.000Z'),
      end: new Date('2026-09-07T11:30:00.000Z'),
      status: 'scheduled',
    });
    const roleRow = await seedRole({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Greeter',
    });
    const targetShift = await seedShift({
      churchId: seed.churchAId,
      participationId: primary.participation.id,
      eventTimeBlockId: primary.eventTimeBlock.id,
      startTime: new Date('2026-09-07T09:00:00.000Z'),
      endTime: new Date('2026-09-07T10:00:00.000Z'),
      label: 'Target',
    });
    const overlapShift = await seedShift({
      churchId: seed.churchAId,
      participationId: overlapBranch.participation.id,
      eventTimeBlockId: overlapBranch.eventTimeBlock.id,
      startTime: new Date('2026-09-07T09:30:00.000Z'),
      endTime: new Date('2026-09-07T10:30:00.000Z'),
      label: 'Overlap',
    });
    const targetRequirement = await seedRequirement({
      churchId: seed.churchAId,
      participationId: primary.participation.id,
      shiftId: targetShift.id,
      roleId: roleRow.id,
      peopleNeeded: 2,
    });
    const overlapRequirement = await seedRequirement({
      churchId: seed.churchAId,
      participationId: overlapBranch.participation.id,
      shiftId: overlapShift.id,
      roleId: roleRow.id,
      peopleNeeded: 1,
    });

    const firstVolunteer = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'First Volunteer',
      email: 'first-phase6@test.com',
    });
    const overlapVolunteer = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Overlap Volunteer',
      email: 'overlap-phase6@test.com',
    });
    await seedRoleQualification({
      churchId: seed.churchAId,
      membershipId: firstVolunteer.membership.id,
      roleId: roleRow.id,
    });
    await seedRoleQualification({
      churchId: seed.churchAId,
      membershipId: overlapVolunteer.membership.id,
      roleId: roleRow.id,
    });

    const managers = createSchedulingManagers();
    await managers.participationRepo.updateState({
      churchId: ChurchId.from(seed.churchAId),
      participationId: MinistryParticipationId.from(primary.participation.id),
      state: 'availability_requested',
    });
    await seedAssignment({
      churchId: seed.churchAId,
      participationId: overlapBranch.participation.id,
      shiftId: overlapShift.id,
      shiftRequirementId: overlapRequirement.id,
      volunteerId: overlapVolunteer.volunteer.id,
      roleId: roleRow.id,
      status: 'confirmed',
    });

    const firstResult =
      await managers.assignmentManager.createParticipationAssignment({
        churchId: ChurchId.from(seed.churchAId),
        shiftId: ShiftId.from(targetShift.id),
        volunteerId: VolunteerId.from(firstVolunteer.volunteer.id),
        shiftRequirementId: ShiftRequirementId.from({
          raw: targetRequirement.id,
        }),
        actorId: UserId.from(seed.adminUserId),
      });
    expect(firstResult.assignment.shiftId).toBe(targetShift.id);
    expect(firstResult.assignment.shiftRequirementId).toBe(
      targetRequirement.id,
    );
    expect(firstResult.assignment.roleId).toBe(roleRow.id);
    expect(firstResult.assignment.participationId).toBe(
      primary.participation.id,
    );
    expect(firstResult.warnings).toEqual([]);

    await expect(
      managers.assignmentManager.createParticipationAssignment({
        churchId: ChurchId.from(seed.churchAId),
        shiftId: ShiftId.from(targetShift.id),
        volunteerId: VolunteerId.from(firstVolunteer.volunteer.id),
        shiftRequirementId: ShiftRequirementId.from({
          raw: overlapRequirement.id,
        }),
        actorId: UserId.from(seed.adminUserId),
      }),
    ).rejects.toThrow('Shift requirement not found');

    const completionAfterFirst =
      await managers.participationManager.getCompletion({
        churchId: ChurchId.from(seed.churchAId),
        participationId: MinistryParticipationId.from(primary.participation.id),
      });
    expect(completionAfterFirst.assignedCount).toBe(1);
    expect(completionAfterFirst.peopleNeeded).toBe(2);
    expect(completionAfterFirst.completionPercent).toBe(50);

    await expect(
      managers.assignmentManager.createParticipationAssignment({
        churchId: ChurchId.from(seed.churchAId),
        shiftId: ShiftId.from(targetShift.id),
        volunteerId: VolunteerId.from(firstVolunteer.volunteer.id),
        shiftRequirementId: ShiftRequirementId.from({
          raw: targetRequirement.id,
        }),
        actorId: UserId.from(seed.adminUserId),
      }),
    ).rejects.toMatchObject({
      reason: 'DUPLICATE_ASSIGNMENT',
    });

    await expect(
      managers.assignmentManager.createParticipationAssignment({
        churchId: ChurchId.from(seed.churchAId),
        shiftId: ShiftId.from(targetShift.id),
        volunteerId: VolunteerId.from(overlapVolunteer.volunteer.id),
        shiftRequirementId: ShiftRequirementId.from({
          raw: targetRequirement.id,
        }),
        actorId: UserId.from(seed.adminUserId),
      }),
    ).rejects.toMatchObject({
      reason: 'DUPLICATE_ASSIGNMENT',
      message: 'Volunteer is already assigned to another overlapping shift',
    });
  });

  it('caps completion at the places filled in each requirement', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'October 2026',
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      endDate: new Date('2026-11-01T00:00:00.000Z'),
      state: 'sent',
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Capped completion service',
      start: new Date('2026-10-04T09:00:00.000Z'),
      end: new Date('2026-10-04T11:00:00.000Z'),
      status: 'scheduled',
    });
    const role = await seedRole({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Host',
    });
    const shift = await seedShift({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      eventTimeBlockId: graph.eventTimeBlock.id,
      startTime: graph.eventTimeBlock.startTime,
      endTime: graph.eventTimeBlock.endTime,
      label: 'Morning',
    });
    const alpha = await seedRequirement({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      roleId: role.id,
      peopleNeeded: 1,
    });
    const betaSector = await seedSector({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Beta Room',
    });
    const beta = await seedRequirement({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      roleId: role.id,
      sectorId: betaSector.id,
      peopleNeeded: 1,
    });
    const activeOne = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Active One',
      email: 'active-one-completion@test.com',
    });
    const activeTwo = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Active Two',
      email: 'active-two-completion@test.com',
    });
    const declined = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Declined Completion',
      email: 'declined-completion@test.com',
    });
    const cancelled = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Cancelled Completion',
      email: 'cancelled-completion@test.com',
    });
    for (const [volunteerId, requirementId, status] of [
      [activeOne.volunteer.id, alpha.id, 'confirmed'],
      [activeTwo.volunteer.id, alpha.id, 'pending'],
      [declined.volunteer.id, beta.id, 'declined'],
      [cancelled.volunteer.id, beta.id, 'cancelled'],
    ] as const) {
      await seedAssignment({
        churchId: seed.churchAId,
        participationId: graph.participation.id,
        shiftId: shift.id,
        volunteerId,
        roleId: role.id,
        shiftRequirementId: requirementId,
        status,
      });
    }

    const managers = createSchedulingManagers();
    const completion = await managers.participationManager.getCompletion({
      churchId: ChurchId.from(seed.churchAId),
      participationId: MinistryParticipationId.from(graph.participation.id),
    });
    expect(completion).toMatchObject({
      peopleNeeded: 2,
      assignedCount: 2,
      completionPercent: 50,
    });
  });

  it('DL2-PB-01/02/03/04/05/06 publishes one participation in isolation and reveals only published slices', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'October 2026',
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      endDate: new Date('2026-11-01T00:00:00.000Z'),
      state: 'sent',
    });
    const sharedEvent = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Shared event',
      start: new Date('2026-10-04T09:00:00.000Z'),
      end: new Date('2026-10-04T11:00:00.000Z'),
      status: 'scheduled',
    });
    const secondMinistry = await buildMinistry({
      db: schedulingTestDb,
      id: randomUUID(),
      churchId: seed.churchAId,
      name: 'Second ministry',
    });
    const secondParticipation = await buildMinistryParticipation({
      db: schedulingTestDb,
      churchId: seed.churchAId,
      ministryId: secondMinistry.id,
      eventId: sharedEvent.event.id,
      state: 'assigning',
      eventTimeBlockIds: [],
    });

    const roleA = await seedRole({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Host',
    });
    const roleB = await seedRole({
      churchId: seed.churchAId,
      ministryId: secondMinistry.id,
      name: 'Care Host',
    });
    const primaryShift = await seedShift({
      churchId: seed.churchAId,
      participationId: sharedEvent.participation.id,
      eventTimeBlockId: sharedEvent.eventTimeBlock.id,
      startTime: new Date('2026-10-04T09:00:00.000Z'),
      endTime: new Date('2026-10-04T10:00:00.000Z'),
      label: 'Primary',
    });
    const secondaryShift = await seedShift({
      churchId: seed.churchAId,
      participationId: secondParticipation.id,
      eventTimeBlockId: sharedEvent.eventTimeBlock.id,
      startTime: new Date('2026-10-04T10:00:00.000Z'),
      endTime: new Date('2026-10-04T11:00:00.000Z'),
      label: 'Secondary',
    });
    const primaryShiftRequirement = await seedRequirement({
      churchId: seed.churchAId,
      participationId: sharedEvent.participation.id,
      shiftId: primaryShift.id,
      roleId: roleA.id,
      peopleNeeded: 2,
    });
    const secondaryShiftRequirement = await seedRequirement({
      churchId: seed.churchAId,
      participationId: secondParticipation.id,
      shiftId: secondaryShift.id,
      roleId: roleB.id,
      peopleNeeded: 1,
    });

    const primaryVolunteer = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Primary Volunteer',
      email: 'primary-phase6@test.com',
    });
    const secondVolunteer = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: secondMinistry.id,
      name: 'Second Volunteer',
      email: 'second-phase6@test.com',
    });
    const floatingVolunteer = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Floating Volunteer',
      email: 'floating-phase6@test.com',
    });

    const managers = createSchedulingManagers();
    await managers.participationRepo.updateState({
      churchId: ChurchId.from(seed.churchAId),
      participationId: MinistryParticipationId.from(
        sharedEvent.participation.id,
      ),
      state: 'assigning',
    });

    const publishedCandidate = await seedAssignment({
      churchId: seed.churchAId,
      participationId: sharedEvent.participation.id,
      shiftId: primaryShift.id,
      shiftRequirementId: primaryShiftRequirement.id,
      volunteerId: primaryVolunteer.volunteer.id,
      roleId: roleA.id,
      status: 'pending',
    });
    await seedAssignment({
      churchId: seed.churchAId,
      participationId: secondParticipation.id,
      shiftId: secondaryShift.id,
      shiftRequirementId: secondaryShiftRequirement.id,
      volunteerId: secondVolunteer.volunteer.id,
      roleId: roleB.id,
      status: 'pending',
    });
    await seedAssignment({
      churchId: seed.churchAId,
      participationId: secondParticipation.id,
      shiftId: secondaryShift.id,
      shiftRequirementId: secondaryShiftRequirement.id,
      volunteerId: floatingVolunteer.volunteer.id,
      roleId: roleB.id,
      status: 'pending',
    });

    const publishInput = {
      churchId: ChurchId.from(seed.churchAId),
      cycleId: CycleId.from(cycle.id),
      ministryId: MinistryId.from(seed.ministryAId),
      userId: UserId.from(seed.adminUserId),
    };
    const blocked =
      await managers.participationManager.publishCycle(publishInput);
    expect(blocked).toMatchObject({ published: false, belowFull: true });

    await managers.participationManager.publishCycle({
      ...publishInput,
      confirmBelowFull: true,
    });

    const published = await managers.participationRepo.getById({
      churchId: ChurchId.from(seed.churchAId),
      participationId: MinistryParticipationId.from(
        sharedEvent.participation.id,
      ),
    });
    const sibling = await managers.participationRepo.getById({
      churchId: ChurchId.from(seed.churchAId),
      participationId: MinistryParticipationId.from(secondParticipation.id),
    });
    expect(published.state).toBe('published');
    expect(sibling.state).toBe('assigning');

    const volunteerSchedule =
      await managers.volunteerManager.getPublishedSchedule({
        churchId: ChurchId.from(seed.churchAId),
        volunteerId: VolunteerId.from(primaryVolunteer.volunteer.id),
      });
    expect(volunteerSchedule.map((assignment) => assignment.id)).toEqual([
      publishedCandidate.id,
    ]);

    const hiddenSchedule = await managers.volunteerManager.getPublishedSchedule(
      {
        churchId: ChurchId.from(seed.churchAId),
        volunteerId: VolunteerId.from(secondVolunteer.volunteer.id),
      },
    );
    expect(hiddenSchedule).toHaveLength(0);
    expect(managers.notificationSpy.notifyVolunteer.mock.calls).toContainEqual([
      expect.objectContaining({
        type: 'schedule_published',
        volunteerId: primaryVolunteer.volunteer.id,
      }),
    ]);
  });

  it('DL2-DS-01 maps same-role rows of two Sectors in ministry schedule without claimedAssignmentIds workarounds', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'November 2026',
      startDate: new Date('2026-11-01T00:00:00.000Z'),
      endDate: new Date('2026-12-01T00:00:00.000Z'),
      state: 'sent',
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Sector-attributed service',
      start: new Date('2026-11-08T09:00:00.000Z'),
      end: new Date('2026-11-08T11:00:00.000Z'),
      status: 'scheduled',
    });
    const hostRole = await seedRole({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Host',
    });
    const alphaSector = await seedSector({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Alpha Sector',
    });
    const betaSector = await seedSector({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Beta Sector',
    });
    const viewer = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Viewer Volunteer',
      email: 'viewer-phase6@test.com',
    });
    const alphaVolunteer = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Alice Alpha',
      email: 'alice-phase6@test.com',
    });
    const betaVolunteer = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Bobby Beta',
      email: 'bobby-phase6@test.com',
    });
    const shift = await seedShift({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      eventTimeBlockId: graph.eventTimeBlock.id,
      startTime: new Date('2026-11-08T09:00:00.000Z'),
      endTime: new Date('2026-11-08T10:00:00.000Z'),
      label: 'Front doors',
    });
    const alphaRequirement = await seedRequirement({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      roleId: hostRole.id,
      sectorId: alphaSector.id,
      peopleNeeded: 1,
    });
    const betaRequirement = await seedRequirement({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      roleId: hostRole.id,
      sectorId: betaSector.id,
      peopleNeeded: 1,
    });
    await seedAssignment({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      volunteerId: alphaVolunteer.volunteer.id,
      roleId: hostRole.id,
      shiftRequirementId: alphaRequirement.id,
      status: 'confirmed',
    });
    await seedAssignment({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      volunteerId: betaVolunteer.volunteer.id,
      roleId: hostRole.id,
      shiftRequirementId: betaRequirement.id,
      status: 'pending',
    });

    const managers = createSchedulingManagers();
    await managers.participationRepo.updateState({
      churchId: ChurchId.from(seed.churchAId),
      participationId: MinistryParticipationId.from(graph.participation.id),
      state: 'published',
    });

    const schedule = await managers.volunteerManager.getMinistrySchedule({
      churchId: ChurchId.from(seed.churchAId),
      ministryId: MinistryId.from(seed.ministryAId),
      volunteerId: VolunteerId.from(viewer.volunteer.id),
    });
    const rows = schedule.events[0]?.rows ?? [];

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roleName: 'Host',
          sectorName: 'Alpha Sector',
          volunteerDisplayName: 'Alice A.',
          confirmationState: 'confirmed',
        }),
        expect.objectContaining({
          roleName: 'Host',
          sectorName: 'Beta Sector',
          volunteerDisplayName: 'Bobby B.',
          confirmationState: 'pending',
        }),
      ]),
    );
    expect(rows.every((row) => !('teamName' in row))).toBe(true);
  });

  it('DL2-DS-02 counts a single assignment once when the two Sectors share a role in one Shift', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'December 2026',
      startDate: new Date('2026-12-01T00:00:00.000Z'),
      endDate: new Date('2027-01-01T00:00:00.000Z'),
      state: 'sent',
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Multi-Sector-attributed service',
      start: new Date('2026-12-06T09:00:00.000Z'),
      end: new Date('2026-12-06T11:00:00.000Z'),
      status: 'scheduled',
    });
    const hostRole = await seedRole({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Host',
    });
    const alphaSector = await seedSector({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Alpha Sector',
    });
    const betaSector = await seedSector({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Beta Sector',
    });
    const viewer = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Viewer Volunteer',
      email: 'viewer2-phase6@test.com',
    });
    const dualVolunteer = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Dual Volunteer',
      email: 'dual-phase6@test.com',
    });
    const shift = await seedShift({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      eventTimeBlockId: graph.eventTimeBlock.id,
      startTime: new Date('2026-12-06T09:00:00.000Z'),
      endTime: new Date('2026-12-06T10:00:00.000Z'),
      label: 'Front doors',
    });
    const alphaRequirement = await seedRequirement({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      roleId: hostRole.id,
      sectorId: alphaSector.id,
      peopleNeeded: 1,
    });
    const betaRequirement = await seedRequirement({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      roleId: hostRole.id,
      sectorId: betaSector.id,
      peopleNeeded: 1,
    });
    await seedAssignment({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      volunteerId: dualVolunteer.volunteer.id,
      roleId: hostRole.id,
      shiftRequirementId: alphaRequirement.id,
      status: 'confirmed',
    });
    await seedAssignment({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      volunteerId: dualVolunteer.volunteer.id,
      roleId: hostRole.id,
      shiftRequirementId: betaRequirement.id,
      status: 'declined',
    });

    const managers = createSchedulingManagers();
    await managers.participationRepo.updateState({
      churchId: ChurchId.from(seed.churchAId),
      participationId: MinistryParticipationId.from(graph.participation.id),
      state: 'published',
    });

    const schedule = await managers.volunteerManager.getMinistrySchedule({
      churchId: ChurchId.from(seed.churchAId),
      ministryId: MinistryId.from(seed.ministryAId),
      volunteerId: VolunteerId.from(viewer.volunteer.id),
    });
    const rows = schedule.events[0]?.rows ?? [];

    // One physical assignment can only satisfy ONE of the two Sector
    // requirements. It must count once (one confirmed row, one still-open
    // row for the other Sector) — never zero open rows (double counted) and
    // never two confirmed rows (duplicated).
    expect(rows).toHaveLength(3);

    const confirmedRow = rows.find(
      (row) => row.confirmationState === 'confirmed',
    );
    const openRow = rows.find((row) => row.confirmationState === 'open');
    const declinedRow = rows.find(
      (row) => row.confirmationState === 'declined',
    );

    expect(confirmedRow).toEqual(
      expect.objectContaining({
        roleName: 'Host',
        sectorName: 'Alpha Sector',
        volunteerDisplayName: 'Dual V.',
      }),
    );
    expect(openRow).toEqual(
      expect.objectContaining({
        roleName: 'Host',
        sectorName: 'Beta Sector',
      }),
    );
    expect(declinedRow).toEqual(
      expect.objectContaining({
        roleName: 'Host',
        sectorName: 'Beta Sector',
        confirmationState: 'declined',
      }),
    );
  });
});
