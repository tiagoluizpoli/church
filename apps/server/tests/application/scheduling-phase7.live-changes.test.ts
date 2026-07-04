import { randomUUID } from 'node:crypto';
import { NotFoundError } from '@church/core';
import {
  assignment as assignmentTable,
  ministryVolunteer,
  role,
  shift as shiftTable,
  slotRequirement,
  user,
  volunteer,
} from '@church/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { DbAssignmentManager } from '../../src/application/db-assignment-manager';
import { DbParticipationManager } from '../../src/application/db-participation-manager';
import { DbVolunteerManager } from '../../src/application/db-volunteer-manager';
import {
  AssignmentId,
  ChurchId,
  MinistryParticipationId,
  UserId,
  VolunteerId,
} from '../../src/domain/branded-ids';
import { AssignmentAccessDeniedError } from '../../src/domain/errors/assignment-access-denied';
import { CancelWindowClosedError } from '../../src/domain/errors/cancel-window-closed';
import { DrizzleAssignmentRepository } from '../../src/infrastructure/repositories/drizzle-assignment.repository';
import { DrizzleAssignmentAuditRepository } from '../../src/infrastructure/repositories/drizzle-assignment-audit.repository';
import { DrizzleAvailabilityRepository } from '../../src/infrastructure/repositories/drizzle-availability.repository';
import { DrizzleAvailabilityCheckRepository } from '../../src/infrastructure/repositories/drizzle-availability-check.repository';
import { DrizzleEventRepository } from '../../src/infrastructure/repositories/drizzle-event.repository';
import { DrizzleMinistryRepository } from '../../src/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleMinistryParticipationRepository } from '../../src/infrastructure/repositories/drizzle-ministry-participation.repository';
import { DrizzleMinistryServingProfileRepository } from '../../src/infrastructure/repositories/drizzle-ministry-serving-profile.repository';
import { DrizzlePlanningEventRepository } from '../../src/infrastructure/repositories/drizzle-planning-event.repository';
import { DrizzleRoleRepository } from '../../src/infrastructure/repositories/drizzle-role.repository';
import { DrizzleShiftRepository } from '../../src/infrastructure/repositories/drizzle-shift.repository';
import { DrizzleTeamRepository } from '../../src/infrastructure/repositories/drizzle-team.repository';
import { DrizzleTimeSlotRepository } from '../../src/infrastructure/repositories/drizzle-time-slot.repository';
import { DrizzleUnitOfWork } from '../../src/infrastructure/repositories/drizzle-unit-of-work';
import { DrizzleVolunteerRepository } from '../../src/infrastructure/repositories/drizzle-volunteer.repository';
import { DrizzleVolunteerNotificationRepository } from '../../src/infrastructure/repositories/drizzle-volunteer-notification.repository';
import { SchedulingFeatureFlagServiceStub } from '../../src/test-support/feature-flag-service-stub';
import { createNotificationServiceSpy } from '../../src/test-support/notification-service-spy';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '../scheduling-reshape/setup';

interface Phase7Managers {
  assignmentManager: DbAssignmentManager;
  participationManager: DbParticipationManager;
  volunteerManager: DbVolunteerManager;
  assignmentRepo: DrizzleAssignmentRepository;
  participationRepo: DrizzleMinistryParticipationRepository;
  notificationSpy: ReturnType<typeof createNotificationServiceSpy>;
}

interface CreatePhase7ManagersInput {
  cancelLeadTimeDays?: number;
}

function createPhase7Managers({
  cancelLeadTimeDays = 3,
}: CreatePhase7ManagersInput = {}): Phase7Managers {
  const assignmentRepo = new DrizzleAssignmentRepository(schedulingTestDb);
  const participationRepo = new DrizzleMinistryParticipationRepository(
    schedulingTestDb,
  );
  const shiftRepo = new DrizzleShiftRepository(schedulingTestDb);
  const volunteerRepo = new DrizzleVolunteerRepository(schedulingTestDb);
  const ministryRepo = new DrizzleMinistryRepository(schedulingTestDb);
  const availabilityRepo = new DrizzleAvailabilityRepository(schedulingTestDb);
  const timeSlotRepo = new DrizzleTimeSlotRepository(schedulingTestDb);
  const eventRepo = new DrizzlePlanningEventRepository(schedulingTestDb);
  const notificationSpy = createNotificationServiceSpy();
  const unitOfWork = new DrizzleUnitOfWork(schedulingTestDb);
  const plainEventRepo = new DrizzleEventRepository(schedulingTestDb);
  const availabilityCheckRepo = new DrizzleAvailabilityCheckRepository(
    schedulingTestDb,
  );

  return {
    assignmentManager: new DbAssignmentManager(
      assignmentRepo,
      new DrizzleAssignmentAuditRepository(schedulingTestDb),
      shiftRepo,
      participationRepo,
      ministryRepo,
      volunteerRepo,
      availabilityRepo,
      eventRepo,
      notificationSpy,
      unitOfWork,
    ),
    participationManager: new DbParticipationManager(
      participationRepo,
      shiftRepo,
      eventRepo,
      assignmentRepo,
      availabilityRepo,
      timeSlotRepo,
      volunteerRepo,
      ministryRepo,
      new DrizzleMinistryServingProfileRepository(schedulingTestDb),
      notificationSpy,
      unitOfWork,
    ),
    volunteerManager: new DbVolunteerManager(
      volunteerRepo,
      assignmentRepo,
      availabilityRepo,
      new DrizzleVolunteerNotificationRepository(schedulingTestDb),
      plainEventRepo,
      shiftRepo,
      ministryRepo,
      participationRepo,
      new DrizzleRoleRepository(schedulingTestDb),
      new DrizzleTeamRepository(schedulingTestDb),
      availabilityCheckRepo,
      new SchedulingFeatureFlagServiceStub({
        participationDefaultAllIn: true,
        volunteerDashboardAllowOverlapSave: true,
      }),
      notificationSpy,
      unitOfWork,
      cancelLeadTimeDays,
    ),
    assignmentRepo,
    participationRepo,
    notificationSpy,
  };
}

async function seedRole(input: {
  churchId: string;
  ministryId: string;
  name: string;
}) {
  const [row] = await schedulingTestDb
    .insert(role)
    .values({
      id: randomUUID(),
      churchId: input.churchId,
      ministryId: input.ministryId,
      name: input.name,
      isGlobal: false,
    })
    .returning();

  if (!row) {
    throw new Error('Phase 7 role seed failed');
  }

  return row;
}

async function seedVolunteerMembership(input: {
  churchId: string;
  ministryId: string;
  name: string;
  email: string;
  systemRole?: 'leader' | 'sub_leader' | 'volunteer';
}) {
  const userId = randomUUID();
  const volunteerId = randomUUID();

  await schedulingTestDb.insert(user).values({
    id: userId,
    name: input.name,
    email: input.email,
    emailVerified: true,
  });

  const [volunteerRow] = await schedulingTestDb
    .insert(volunteer)
    .values({
      id: volunteerId,
      churchId: input.churchId,
      userId,
      status: 'active',
    })
    .returning();

  const [membership] = await schedulingTestDb
    .insert(ministryVolunteer)
    .values({
      id: randomUUID(),
      churchId: input.churchId,
      ministryId: input.ministryId,
      volunteerId,
      systemRole: input.systemRole ?? 'volunteer',
      status: 'active',
    })
    .returning();

  if (!volunteerRow || !membership) {
    throw new Error('Phase 7 volunteer membership seed failed');
  }

  return { volunteer: volunteerRow, membership };
}

async function seedShift(input: {
  churchId: string;
  participationId: string;
  timeSlotId: string;
  startTime: Date;
  endTime: Date;
  label: string;
}) {
  const [row] = await schedulingTestDb
    .insert(shiftTable)
    .values({
      id: randomUUID(),
      churchId: input.churchId,
      participationId: input.participationId,
      timeSlotId: input.timeSlotId,
      startTime: input.startTime,
      endTime: input.endTime,
      label: input.label,
    })
    .returning();

  if (!row) {
    throw new Error('Phase 7 shift seed failed');
  }

  return row;
}

async function seedRequirement(input: {
  churchId: string;
  participationId: string;
  shiftId: string;
  roleId: string;
  requiredCount: number;
}) {
  const [row] = await schedulingTestDb
    .insert(slotRequirement)
    .values({
      id: randomUUID(),
      churchId: input.churchId,
      participationId: input.participationId,
      shiftId: input.shiftId,
      roleId: input.roleId,
      requiredCount: input.requiredCount,
    })
    .returning();

  if (!row) {
    throw new Error('Phase 7 requirement seed failed');
  }

  return row;
}

async function seedAssignment(input: {
  churchId: string;
  participationId: string;
  shiftId: string;
  volunteerId: string;
  roleId: string;
  status?: 'draft' | 'pending' | 'confirmed' | 'declined' | 'cancelled';
}) {
  const [row] = await schedulingTestDb
    .insert(assignmentTable)
    .values({
      id: randomUUID(),
      churchId: input.churchId,
      participationId: input.participationId,
      shiftId: input.shiftId,
      volunteerId: input.volunteerId,
      roleId: input.roleId,
      status: input.status ?? 'confirmed',
    })
    .returning();

  if (!row) {
    throw new Error('Phase 7 assignment seed failed');
  }

  return row;
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
      startDate: new Date('2026-12-06T09:00:00.000Z'),
      endDate: new Date('2026-12-06T11:00:00.000Z'),
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
      systemRole: 'leader',
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

    const managers = createPhase7Managers();
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
      startDate: new Date('2027-01-10T09:00:00.000Z'),
      endDate: new Date('2027-01-10T11:00:00.000Z'),
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

    const managers = createPhase7Managers();
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
      startDate: new Date('2027-02-07T09:00:00.000Z'),
      endDate: new Date('2027-02-07T11:00:00.000Z'),
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

    const assignment = await seedAssignment({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      volunteerId: outgoing.volunteer.id,
      roleId: roleRow.id,
      status: 'confirmed',
    });

    const managers = createPhase7Managers();
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
      startDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      endDate: new Date(now.getTime() + 25 * 60 * 60 * 1000),
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

    const managers = createPhase7Managers({ cancelLeadTimeDays: 3 });
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
