import { NotFoundError } from '@church/core';
import { assignmentAudit } from '@church/db';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { AssignmentId, ChurchId, UserId } from '@/domain/branded-ids';
import { buildAssignment } from '@/seeds/builders/scheduling';
import {
  createSchedulingManagers,
  seedRequirement,
  seedRole,
  seedShift,
  seedVolunteerMembership,
} from '@/tests/application/scheduling-schedule.helpers';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

interface SeedAssignmentInput {
  churchId: string;
  participationId: string;
  shiftId: string;
  volunteerId: string;
  roleId: string;
  shiftRequirementId: string;
}
async function seedAssignment(input: SeedAssignmentInput) {
  return buildAssignment({
    db: schedulingTestDb,
    ...input,
    status: 'confirmed',
  });
}
describe('assignment audit deletion persistence', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });
  it('deleteAssignment removes the assignment row and keeps its deleted audit', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'April 2027',
      startDate: new Date('2027-04-01T00:00:00.000Z'),
      endDate: new Date('2027-05-01T00:00:00.000Z'),
      state: 'sent',
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Delete assignment service',
      start: new Date('2027-04-04T09:00:00.000Z'),
      end: new Date('2027-04-04T10:00:00.000Z'),
      status: 'scheduled',
    });
    const roleRow = await seedRole({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Delete role',
    });
    const shift = await seedShift({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      eventTimeBlockId: graph.eventTimeBlock.id,
      startTime: graph.eventTimeBlock.startTime,
      endTime: graph.eventTimeBlock.endTime,
      label: 'Delete shift',
    });
    const requirement = await seedRequirement({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      roleId: roleRow.id,
      peopleNeeded: 1,
    });
    const volunteerWithActor = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'With Actor Delete',
      email: 'with-actor-delete-phase7@test.com',
    });

    const managers = createSchedulingManagers();
    const assignmentWithActor = await seedAssignment({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      shiftRequirementId: requirement.id,
      volunteerId: volunteerWithActor.volunteer.id,
      roleId: roleRow.id,
    });

    await managers.assignmentManager.deleteAssignment({
      churchId: ChurchId.from(seed.churchAId),
      assignmentId: AssignmentId.from(assignmentWithActor.id),
      actorId: UserId.from(seed.adminUserId),
    });

    await expect(
      managers.assignmentRepo.getById({
        churchId: ChurchId.from(seed.churchAId),
        assignmentId: AssignmentId.from(assignmentWithActor.id),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // The audit row outlives the hard-deleted Assignment it names.
    const audit = await schedulingTestDb
      .select()
      .from(assignmentAudit)
      .where(eq(assignmentAudit.assignmentId, assignmentWithActor.id));
    expect(audit).toMatchObject([
      { action: 'deleted', actorId: seed.adminUserId },
    ]);
  });
});
