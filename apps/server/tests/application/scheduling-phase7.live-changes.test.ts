import { NotFoundError } from '@church/core';
import { ministry } from '@church/db';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildAvailabilityCheck,
  buildUnavailabilityMark,
} from '../../seeds/builders/availability';
import { buildMinistry } from '../../seeds/builders/ministry';
import { buildAssignment } from '../../seeds/builders/scheduling';
import {
  AssignmentId,
  ChurchId,
  MinistryParticipationId,
  RoleId,
  ShiftId,
  TimeSlotId,
  UserId,
  VolunteerId,
} from '../../src/domain/branded-ids';
import { AssignmentAccessDeniedError } from '../../src/domain/errors/assignment-access-denied';
import { CancelWindowClosedError } from '../../src/domain/errors/cancel-window-closed';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '../scheduling-reshape/setup';
import {
  createSchedulingManagers,
  seedRequirement,
  seedRole,
  seedRoleQualification,
  seedShift,
  seedVolunteerMembership,
} from './scheduling-roster.helpers';

interface SeedAssignmentInput {
  churchId: string;
  participationId: string;
  shiftId: string;
  volunteerId: string;
  roleId: string;
  status?: 'draft' | 'pending' | 'confirmed' | 'declined' | 'cancelled';
}

async function seedAssignment(input: SeedAssignmentInput) {
  return await buildAssignment({
    db: schedulingTestDb,
    ...input,
    status: input.status ?? 'confirmed',
  });
}

describe('Phase 7 live execution and late changes (US5)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('DL2-LC-01/03 lets a volunteer cancel their own published assignment, reopening the slot to the same state as unfilled and notifying the leader', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'December 2026',
      startDate: new Date('2026-12-01T00:00:00.000Z'),
      endDate: new Date('2027-01-01T00:00:00.000Z'),
      state: 'locked',
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Live execution service',
      start: new Date('2026-12-06T09:00:00.000Z'),
      end: new Date('2026-12-06T11:00:00.000Z'),
      status: 'scheduled',
    });
    const roleRow = await seedRole({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Usher',
    });
    const shift = await seedShift({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      timeSlotId: graph.slot.id,
      startTime: new Date('2026-12-06T09:00:00.000Z'),
      endTime: new Date('2026-12-06T10:00:00.000Z'),
      label: 'Front doors',
    });
    await seedRequirement({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      roleId: roleRow.id,
      requiredCount: 1,
    });

    const leader = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Leader Volunteer',
      email: 'leader-phase7@test.com',
      ministryAccessLevel: 'leader',
    });
    const volunteerA = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Cancels Own',
      email: 'cancels-own-phase7@test.com',
    });

    const assignment = await seedAssignment({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      volunteerId: volunteerA.volunteer.id,
      roleId: roleRow.id,
      status: 'confirmed',
    });

    const managers = createSchedulingManagers();
    await managers.participationRepo.updateState({
      churchId: ChurchId.from(seed.churchAId),
      participationId: MinistryParticipationId.from(graph.participation.id),
      state: 'published',
    });

    const completionBeforeCancel =
      await managers.participationManager.getCompletion({
        churchId: ChurchId.from(seed.churchAId),
        participationId: MinistryParticipationId.from(graph.participation.id),
      });
    expect(completionBeforeCancel.assignedCount).toBe(1);

    await managers.volunteerManager.cancelOwnAssignment({
      churchId: ChurchId.from(seed.churchAId),
      assignmentId: AssignmentId.from(assignment.id),
      volunteerId: VolunteerId.from(volunteerA.volunteer.id),
    });

    await expect(
      managers.assignmentRepo.getById(
        ChurchId.from(seed.churchAId),
        AssignmentId.from(assignment.id),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    const completionAfterCancel =
      await managers.participationManager.getCompletion({
        churchId: ChurchId.from(seed.churchAId),
        participationId: MinistryParticipationId.from(graph.participation.id),
      });
    expect(completionAfterCancel.assignedCount).toBe(0);
    expect(completionAfterCancel.requiredCount).toBe(
      completionBeforeCancel.requiredCount,
    );
    expect(completionAfterCancel.completionPercent).toBe(0);

    expect(managers.notificationSpy.notifyVolunteer.mock.calls).toContainEqual([
      expect.objectContaining({
        type: 'assignment_removed',
        volunteerId: leader.volunteer.id,
      }),
    ]);
  });

  it("DL2-LC-02 rejects a volunteer cancelling someone else's assignment", async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'January 2027',
      startDate: new Date('2027-01-01T00:00:00.000Z'),
      endDate: new Date('2027-02-01T00:00:00.000Z'),
      state: 'locked',
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Permission check service',
      start: new Date('2027-01-10T09:00:00.000Z'),
      end: new Date('2027-01-10T11:00:00.000Z'),
      status: 'scheduled',
    });
    const roleRow = await seedRole({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Greeter',
    });
    const shift = await seedShift({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      timeSlotId: graph.slot.id,
      startTime: new Date('2027-01-10T09:00:00.000Z'),
      endTime: new Date('2027-01-10T10:00:00.000Z'),
      label: 'Front doors',
    });
    await seedRequirement({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      roleId: roleRow.id,
      requiredCount: 1,
    });

    const owner = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Assignment Owner',
      email: 'owner-phase7@test.com',
    });
    const intruder = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Other Volunteer',
      email: 'intruder-phase7@test.com',
    });

    const assignment = await seedAssignment({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      volunteerId: owner.volunteer.id,
      roleId: roleRow.id,
      status: 'confirmed',
    });

    const managers = createSchedulingManagers();
    await managers.participationRepo.updateState({
      churchId: ChurchId.from(seed.churchAId),
      participationId: MinistryParticipationId.from(graph.participation.id),
      state: 'published',
    });

    await expect(
      managers.volunteerManager.cancelOwnAssignment({
        churchId: ChurchId.from(seed.churchAId),
        assignmentId: AssignmentId.from(assignment.id),
        volunteerId: VolunteerId.from(intruder.volunteer.id),
      }),
    ).rejects.toBeInstanceOf(AssignmentAccessDeniedError);

    const stillAssigned = await managers.assignmentRepo.getById(
      ChurchId.from(seed.churchAId),
      AssignmentId.from(assignment.id),
    );
    expect(stillAssigned.volunteerId).toBe(owner.volunteer.id);
  });

  it('DL2-RS-08 lets a leader reassign a shift mid-cycle, notifying both the outgoing and incoming volunteer', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'February 2027',
      startDate: new Date('2027-02-01T00:00:00.000Z'),
      endDate: new Date('2027-03-01T00:00:00.000Z'),
      state: 'locked',
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Reassign service',
      start: new Date('2027-02-07T09:00:00.000Z'),
      end: new Date('2027-02-07T11:00:00.000Z'),
      status: 'scheduled',
    });
    const roleRow = await seedRole({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Host',
    });
    const shift = await seedShift({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      timeSlotId: graph.slot.id,
      startTime: new Date('2027-02-07T09:00:00.000Z'),
      endTime: new Date('2027-02-07T10:00:00.000Z'),
      label: 'Front doors',
    });
    await seedRequirement({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      roleId: roleRow.id,
      requiredCount: 1,
    });

    const outgoing = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Outgoing Volunteer',
      email: 'outgoing-phase7@test.com',
    });
    const incoming = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Incoming Volunteer',
      email: 'incoming-phase7@test.com',
    });
    await seedRoleQualification({
      churchId: seed.churchAId,
      membershipId: incoming.membership.id,
      roleId: roleRow.id,
    });

    const assignment = await seedAssignment({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      volunteerId: outgoing.volunteer.id,
      roleId: roleRow.id,
      status: 'confirmed',
    });

    const managers = createSchedulingManagers();
    await managers.participationRepo.updateState({
      churchId: ChurchId.from(seed.churchAId),
      participationId: MinistryParticipationId.from(graph.participation.id),
      state: 'rostering',
    });

    const reassigned =
      await managers.assignmentManager.reassignParticipationAssignment({
        churchId: ChurchId.from(seed.churchAId),
        assignmentId: AssignmentId.from(assignment.id),
        volunteerId: VolunteerId.from(incoming.volunteer.id),
        actorId: UserId.from(seed.adminUserId),
        reason: 'Original volunteer became unavailable',
      });

    expect(reassigned.volunteerId).toBe(incoming.volunteer.id);
    expect(reassigned.shiftId).toBe(shift.id);

    await expect(
      managers.assignmentRepo.getById(
        ChurchId.from(seed.churchAId),
        AssignmentId.from(assignment.id),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(managers.notificationSpy.notifyVolunteer.mock.calls).toContainEqual([
      expect.objectContaining({
        type: 'assignment_removed',
        volunteerId: outgoing.volunteer.id,
      }),
    ]);
    expect(managers.notificationSpy.notifyVolunteer.mock.calls).toContainEqual([
      expect.objectContaining({
        type: 'assignment_added',
        volunteerId: incoming.volunteer.id,
      }),
    ]);
  });

  it('DL2-LC-04 blocks self-cancel inside the church-configured lead time before the shift (FR-028)', async () => {
    const seed = await seedSchedulingPhase3Base();
    const now = new Date();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'Lead time cutoff cycle',
      startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      endDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      state: 'locked',
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Near-term service',
      start: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      end: new Date(now.getTime() + 25 * 60 * 60 * 1000),
      status: 'scheduled',
    });
    const roleRow = await seedRole({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Usher',
    });
    const shift = await seedShift({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      timeSlotId: graph.slot.id,
      startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      endTime: new Date(now.getTime() + 25 * 60 * 60 * 1000),
      label: 'Front doors',
    });
    await seedRequirement({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      roleId: roleRow.id,
      requiredCount: 1,
    });
    const volunteerA = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Cutoff Volunteer',
      email: 'cutoff-phase7@test.com',
    });
    const assignment = await seedAssignment({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      volunteerId: volunteerA.volunteer.id,
      roleId: roleRow.id,
      status: 'confirmed',
    });

    const managers = createSchedulingManagers({ cancelLeadTimeDays: 3 });
    await managers.participationRepo.updateState({
      churchId: ChurchId.from(seed.churchAId),
      participationId: MinistryParticipationId.from(graph.participation.id),
      state: 'published',
    });

    await expect(
      managers.volunteerManager.cancelOwnAssignment({
        churchId: ChurchId.from(seed.churchAId),
        assignmentId: AssignmentId.from(assignment.id),
        volunteerId: VolunteerId.from(volunteerA.volunteer.id),
      }),
    ).rejects.toBeInstanceOf(CancelWindowClosedError);

    const stillAssigned = await managers.assignmentRepo.getById(
      ChurchId.from(seed.churchAId),
      AssignmentId.from(assignment.id),
    );
    expect(stillAssigned.volunteerId).toBe(volunteerA.volunteer.id);
  });
});

interface SeedAvailabilityMarkInput {
  churchId: string;
  planningCycleId: string;
  membershipId: string;
  shiftId: string;
}

async function seedAvailabilityMark(input: SeedAvailabilityMarkInput) {
  const check = await buildAvailabilityCheck({
    db: schedulingTestDb,
    churchId: input.churchId,
    planningCycleId: input.planningCycleId,
    ministryVolunteerId: input.membershipId,
    state: 'pending',
  });

  await buildUnavailabilityMark({
    db: schedulingTestDb,
    churchId: input.churchId,
    availabilityCheckId: check.id,
    shiftId: input.shiftId,
  });
}

describe('Phase 7 assignment manager surfaces (direct create/delete/override + hard-constraint branches)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('createAssignment resolves the whole-slot shift by slotId, and getAssignment/listAuditLog reflect the created row', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'March 2027',
      startDate: new Date('2027-03-01T00:00:00.000Z'),
      endDate: new Date('2027-04-01T00:00:00.000Z'),
      state: 'locked',
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Slot-based assignment service',
      start: new Date('2027-03-07T09:00:00.000Z'),
      end: new Date('2027-03-07T10:00:00.000Z'),
      status: 'scheduled',
    });
    const roleRow = await seedRole({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Slot role',
    });
    const wholeSlotShift = await seedShift({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      timeSlotId: graph.slot.id,
      startTime: graph.slot.startTime,
      endTime: graph.slot.endTime,
      label: 'Whole slot',
    });
    const target = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Direct Assign Target',
      email: 'direct-assign-phase7@test.com',
    });

    const managers = createSchedulingManagers();
    const created = await managers.assignmentManager.createAssignment({
      churchId: ChurchId.from(seed.churchAId),
      slotId: TimeSlotId.from(graph.slot.id),
      volunteerId: VolunteerId.from(target.volunteer.id),
      roleId: RoleId.from(roleRow.id),
      actorId: UserId.from(seed.adminUserId),
      reason: 'Direct staffing',
    });

    expect(created.shiftId).toBe(wholeSlotShift.id);
    expect(created.participationId).toBe(graph.participation.id);
    expect(created.status).toBe('pending');

    const fetched = await managers.assignmentManager.getAssignment({
      churchId: ChurchId.from(seed.churchAId),
      assignmentId: created.id,
    });
    expect(fetched.id).toBe(created.id);

    const audit = await managers.assignmentManager.listAuditLog({
      churchId: ChurchId.from(seed.churchAId),
      assignmentId: created.id,
    });
    expect(audit).toEqual([
      expect.objectContaining({ action: 'created', reason: 'Direct staffing' }),
    ]);
  });

  it('deleteAssignment succeeds without an FK violation and removes the assignment row (audit write happens before delete, in the same transaction)', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'April 2027',
      startDate: new Date('2027-04-01T00:00:00.000Z'),
      endDate: new Date('2027-05-01T00:00:00.000Z'),
      state: 'locked',
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
      timeSlotId: graph.slot.id,
      startTime: graph.slot.startTime,
      endTime: graph.slot.endTime,
      label: 'Delete shift',
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
      volunteerId: volunteerWithActor.volunteer.id,
      roleId: roleRow.id,
    });

    await managers.assignmentManager.deleteAssignment({
      churchId: ChurchId.from(seed.churchAId),
      assignmentId: AssignmentId.from(assignmentWithActor.id),
      actorId: UserId.from(seed.adminUserId),
    });

    await expect(
      managers.assignmentRepo.getById(
        ChurchId.from(seed.churchAId),
        AssignmentId.from(assignmentWithActor.id),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    // The `assignment_audit.assignment_id` FK is ON DELETE CASCADE, so the
    // audit row written just before the delete is itself removed once the
    // parent assignment is gone — this is a separate, pre-existing schema
    // property (audit history does not outlive its assignment), not
    // something this fix changes.
    const audit = await managers.assignmentManager.listAuditLog({
      churchId: ChurchId.from(seed.churchAId),
      assignmentId: AssignmentId.from(assignmentWithActor.id),
    });
    expect(audit).toEqual([]);
  });

  it('overrideAssignment writes an audit entry without deleting or mutating the assignment', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'May 2027',
      startDate: new Date('2027-05-01T00:00:00.000Z'),
      endDate: new Date('2027-06-01T00:00:00.000Z'),
      state: 'locked',
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Override service',
      start: new Date('2027-05-09T09:00:00.000Z'),
      end: new Date('2027-05-09T10:00:00.000Z'),
      status: 'scheduled',
    });
    const roleRow = await seedRole({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Override role',
    });
    const shift = await seedShift({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      timeSlotId: graph.slot.id,
      startTime: graph.slot.startTime,
      endTime: graph.slot.endTime,
      label: 'Override shift',
    });
    const target = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Override Target',
      email: 'override-target-phase7@test.com',
    });

    const managers = createSchedulingManagers();
    const assignment = await seedAssignment({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      volunteerId: target.volunteer.id,
      roleId: roleRow.id,
    });

    await managers.assignmentManager.overrideAssignment({
      churchId: ChurchId.from(seed.churchAId),
      assignmentId: AssignmentId.from(assignment.id),
      actorId: UserId.from(seed.adminUserId),
      reason: 'Leader approved change',
    });

    const stillThere = await managers.assignmentRepo.getById(
      ChurchId.from(seed.churchAId),
      AssignmentId.from(assignment.id),
    );
    expect(stillThere.id).toBe(assignment.id);

    const audit = await managers.assignmentManager.listAuditLog({
      churchId: ChurchId.from(seed.churchAId),
      assignmentId: AssignmentId.from(assignment.id),
    });
    expect(audit).toEqual([
      expect.objectContaining({
        action: 'updated',
        reason: 'Leader approved change',
      }),
    ]);
  });

  it('createParticipationAssignment rejects a volunteer who is not a member of the requested ministry (NOT_IN_MINISTRY)', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'June 2027',
      startDate: new Date('2027-06-01T00:00:00.000Z'),
      endDate: new Date('2027-07-01T00:00:00.000Z'),
      state: 'locked',
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Non-member service',
      start: new Date('2027-06-06T09:00:00.000Z'),
      end: new Date('2027-06-06T10:00:00.000Z'),
      status: 'scheduled',
    });
    const roleRow = await seedRole({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Members-only role',
    });
    const shift = await seedShift({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      timeSlotId: graph.slot.id,
      startTime: graph.slot.startTime,
      endTime: graph.slot.endTime,
      label: 'Members-only shift',
    });

    const otherMinistry = await buildMinistry({
      db: schedulingTestDb,
      churchId: seed.churchAId,
      name: 'Outside ministry',
    });
    const outsider = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: otherMinistry.id,
      name: 'Outsider Volunteer',
      email: 'outsider-phase7@test.com',
    });

    const managers = createSchedulingManagers();
    await expect(
      managers.assignmentManager.createParticipationAssignment({
        churchId: ChurchId.from(seed.churchAId),
        shiftId: ShiftId.from(shift.id),
        volunteerId: VolunteerId.from(outsider.volunteer.id),
        roleId: RoleId.from(roleRow.id),
        actorId: UserId.from(seed.adminUserId),
      }),
    ).rejects.toMatchObject({ reason: 'NOT_IN_MINISTRY' });
  });

  it('createParticipationAssignment enforces qualification by ministry policy and warns when marked unavailable', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'July 2027',
      startDate: new Date('2027-07-01T00:00:00.000Z'),
      endDate: new Date('2027-08-01T00:00:00.000Z'),
      state: 'locked',
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Qualification service',
      start: new Date('2027-07-04T09:00:00.000Z'),
      end: new Date('2027-07-04T10:00:00.000Z'),
      status: 'scheduled',
    });
    const ownRole = await seedRole({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Ministry A role',
    });
    const shift = await seedShift({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      timeSlotId: graph.slot.id,
      startTime: graph.slot.startTime,
      endTime: graph.slot.endTime,
      label: 'Qualification shift',
    });

    const softMember = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Soft Qualification Member',
      email: 'soft-qualification-phase7@test.com',
    });
    const hardMember = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Hard Qualification Member',
      email: 'hard-qualification-phase7@test.com',
    });
    const overrideMember = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Override Qualification Member',
      email: 'override-qualification-phase7@test.com',
    });
    const qualifiedMember = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Qualified Ministry Member',
      email: 'qualified-member-phase7@test.com',
    });

    const managers = createSchedulingManagers();

    const softResult =
      await managers.assignmentManager.createParticipationAssignment({
        churchId: ChurchId.from(seed.churchAId),
        shiftId: ShiftId.from(shift.id),
        volunteerId: VolunteerId.from(softMember.volunteer.id),
        roleId: RoleId.from(ownRole.id),
        actorId: UserId.from(seed.adminUserId),
      });
    expect(softResult.warnings).toEqual([
      expect.objectContaining({ type: 'NOT_QUALIFIED' }),
    ]);

    await schedulingTestDb
      .update(ministry)
      .set({ enforcementType: 'hard' })
      .where(eq(ministry.id, seed.ministryAId));

    await expect(
      managers.assignmentManager.createParticipationAssignment({
        churchId: ChurchId.from(seed.churchAId),
        shiftId: ShiftId.from(shift.id),
        volunteerId: VolunteerId.from(hardMember.volunteer.id),
        roleId: RoleId.from(ownRole.id),
        actorId: UserId.from(seed.adminUserId),
      }),
    ).rejects.toMatchObject({ reason: 'NOT_QUALIFIED' });

    const overrideReason = 'Leader approved qualification override';
    const overridden =
      await managers.assignmentManager.createParticipationAssignment({
        churchId: ChurchId.from(seed.churchAId),
        shiftId: ShiftId.from(shift.id),
        volunteerId: VolunteerId.from(overrideMember.volunteer.id),
        roleId: RoleId.from(ownRole.id),
        actorId: UserId.from(seed.adminUserId),
        override: { reason: overrideReason },
      });
    expect(overridden.warnings).toEqual([
      expect.objectContaining({ type: 'NOT_QUALIFIED' }),
    ]);
    const overrideAudit = await managers.assignmentManager.listAuditLog({
      churchId: ChurchId.from(seed.churchAId),
      assignmentId: overridden.assignment.id,
    });
    expect(overrideAudit).toEqual([
      expect.objectContaining({ reason: overrideReason }),
    ]);

    await seedRoleQualification({
      churchId: seed.churchAId,
      membershipId: qualifiedMember.membership.id,
      roleId: ownRole.id,
    });
    await seedAvailabilityMark({
      churchId: seed.churchAId,
      planningCycleId: cycle.id,
      membershipId: qualifiedMember.membership.id,
      shiftId: shift.id,
    });

    const result =
      await managers.assignmentManager.createParticipationAssignment({
        churchId: ChurchId.from(seed.churchAId),
        shiftId: ShiftId.from(shift.id),
        volunteerId: VolunteerId.from(qualifiedMember.volunteer.id),
        roleId: RoleId.from(ownRole.id),
        actorId: UserId.from(seed.adminUserId),
      });

    expect(result.assignment.volunteerId).toBe(qualifiedMember.volunteer.id);
    expect(result.warnings).toEqual([
      expect.objectContaining({ type: 'UNAVAILABLE' }),
    ]);
  });
});
