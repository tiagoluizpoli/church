import { randomUUID } from 'node:crypto';
import {
  assignment as assignmentTable,
  availabilityCheck as availabilityCheckTable,
  availability as availabilityTable,
  ministry,
  ministryParticipation,
  ministryVolunteer,
  role,
  shift as shiftTable,
  slotRequirement,
  team,
  user,
  volunteer,
} from '@church/db';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { DbAssignmentManager } from '../../src/application/db-assignment-manager';
import { DbParticipationManager } from '../../src/application/db-participation-manager';
import { DbVolunteerManager } from '../../src/application/db-volunteer-manager';
import {
  ChurchId,
  MinistryId,
  MinistryParticipationId,
  RoleId,
  ShiftId,
  UserId,
  VolunteerId,
} from '../../src/domain/branded-ids';
import { BelowFullPublishError } from '../../src/domain/errors/below-full-publish';
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

interface Phase6Managers {
  assignmentManager: DbAssignmentManager;
  participationManager: DbParticipationManager;
  volunteerManager: DbVolunteerManager;
  assignmentRepo: DrizzleAssignmentRepository;
  participationRepo: DrizzleMinistryParticipationRepository;
  notificationSpy: ReturnType<typeof createNotificationServiceSpy>;
}

function createPhase6Managers(): Phase6Managers {
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
      new DrizzleEventRepository(schedulingTestDb),
      shiftRepo,
      ministryRepo,
      participationRepo,
      new DrizzleRoleRepository(schedulingTestDb),
      new DrizzleTeamRepository(schedulingTestDb),
      new DrizzleAvailabilityCheckRepository(schedulingTestDb),
      new SchedulingFeatureFlagServiceStub({
        participationDefaultAllIn: true,
        volunteerDashboardAllowOverlapSave: true,
      }),
      notificationSpy,
      unitOfWork,
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
    throw new Error('Phase 6 role seed failed');
  }

  return row;
}

async function seedTeam(input: {
  churchId: string;
  ministryId: string;
  name: string;
}) {
  const [row] = await schedulingTestDb
    .insert(team)
    .values({
      id: randomUUID(),
      churchId: input.churchId,
      ministryId: input.ministryId,
      name: input.name,
    })
    .returning();

  if (!row) {
    throw new Error('Phase 6 team seed failed');
  }

  return row;
}

async function seedVolunteerMembership(input: {
  churchId: string;
  ministryId: string;
  name: string;
  email: string;
  systemRole?: 'leader' | 'sub_leader' | 'volunteer';
  teamId?: string;
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
      teamId: input.teamId,
      systemRole: input.systemRole ?? 'volunteer',
      status: 'active',
    })
    .returning();

  if (!volunteerRow || !membership) {
    throw new Error('Phase 6 volunteer membership seed failed');
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
    throw new Error('Phase 6 shift seed failed');
  }

  return row;
}

async function seedRequirement(input: {
  churchId: string;
  participationId: string;
  shiftId: string;
  roleId: string;
  requiredCount: number;
  teamId?: string;
}) {
  const [row] = await schedulingTestDb
    .insert(slotRequirement)
    .values({
      id: randomUUID(),
      churchId: input.churchId,
      participationId: input.participationId,
      shiftId: input.shiftId,
      roleId: input.roleId,
      teamId: input.teamId,
      requiredCount: input.requiredCount,
    })
    .returning();

  if (!row) {
    throw new Error('Phase 6 requirement seed failed');
  }

  return row;
}

async function seedAvailabilityMark(input: {
  churchId: string;
  planningCycleId: string;
  membershipId: string;
  shiftId: string;
}) {
  const [check] = await schedulingTestDb
    .insert(availabilityCheckTable)
    .values({
      id: randomUUID(),
      churchId: input.churchId,
      planningCycleId: input.planningCycleId,
      ministryVolunteerId: input.membershipId,
      state: 'pending',
    })
    .returning();

  if (!check) {
    throw new Error('Phase 6 availability check seed failed');
  }

  await schedulingTestDb.insert(availabilityTable).values({
    id: randomUUID(),
    churchId: input.churchId,
    availabilityCheckId: check.id,
    shiftId: input.shiftId,
  });
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
      status: input.status ?? 'pending',
    })
    .returning();

  if (!row) {
    throw new Error('Phase 6 assignment seed failed');
  }

  return row;
}

describe('Phase 6 rostering and publish managers (US4)', () => {
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
      state: 'locked',
    });
    const upcoming = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Roster target',
      startDate: new Date('2026-08-10T09:00:00.000Z'),
      endDate: new Date('2026-08-10T11:00:00.000Z'),
      status: 'scheduled',
    });
    const history = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Earlier service',
      startDate: new Date('2026-08-03T09:00:00.000Z'),
      endDate: new Date('2026-08-03T11:00:00.000Z'),
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
      timeSlotId: upcoming.slot.id,
      startTime: new Date('2026-08-10T09:00:00.000Z'),
      endTime: new Date('2026-08-10T10:00:00.000Z'),
      label: 'Target shift',
    });
    const oldShift = await seedShift({
      churchId: seed.churchAId,
      participationId: history.participation.id,
      timeSlotId: history.slot.id,
      startTime: new Date('2026-08-03T09:00:00.000Z'),
      endTime: new Date('2026-08-03T10:00:00.000Z'),
      label: 'Older shift',
    });
    const recentShift = await seedShift({
      churchId: seed.churchAId,
      participationId: history.participation.id,
      timeSlotId: history.slot.id,
      startTime: new Date('2026-08-03T10:00:00.000Z'),
      endTime: new Date('2026-08-03T11:00:00.000Z'),
      label: 'Recent shift',
    });
    await seedRequirement({
      churchId: seed.churchAId,
      participationId: upcoming.participation.id,
      shiftId: targetShift.id,
      roleId: roleRow.id,
      requiredCount: 1,
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

    await seedAssignment({
      churchId: seed.churchAId,
      participationId: history.participation.id,
      shiftId: oldShift.id,
      volunteerId: ada.volunteer.id,
      roleId: roleRow.id,
      status: 'confirmed',
    });
    await seedAssignment({
      churchId: seed.churchAId,
      participationId: history.participation.id,
      shiftId: recentShift.id,
      volunteerId: grace.volunteer.id,
      roleId: roleRow.id,
      status: 'confirmed',
    });
    await seedAvailabilityMark({
      churchId: seed.churchAId,
      planningCycleId: cycle.id,
      membershipId: alan.membership.id,
      shiftId: targetShift.id,
    });

    const { participationManager } = createPhase6Managers();
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

  it('DL2-RS-03/04/05/06/09 creates participation assignments on the requested shift, updates completion, warns on soft overlap, blocks hard overlap, and audits override', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'September 2026',
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-10-01T00:00:00.000Z'),
      state: 'locked',
    });
    const primary = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Primary service',
      startDate: new Date('2026-09-07T09:00:00.000Z'),
      endDate: new Date('2026-09-07T11:00:00.000Z'),
      status: 'scheduled',
    });
    const overlapBranch = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Overlap branch',
      startDate: new Date('2026-09-07T09:30:00.000Z'),
      endDate: new Date('2026-09-07T11:30:00.000Z'),
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
      timeSlotId: primary.slot.id,
      startTime: new Date('2026-09-07T09:00:00.000Z'),
      endTime: new Date('2026-09-07T10:00:00.000Z'),
      label: 'Target',
    });
    const overlapShift = await seedShift({
      churchId: seed.churchAId,
      participationId: overlapBranch.participation.id,
      timeSlotId: overlapBranch.slot.id,
      startTime: new Date('2026-09-07T09:30:00.000Z'),
      endTime: new Date('2026-09-07T10:30:00.000Z'),
      label: 'Overlap',
    });
    await seedRequirement({
      churchId: seed.churchAId,
      participationId: primary.participation.id,
      shiftId: targetShift.id,
      roleId: roleRow.id,
      requiredCount: 2,
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

    const managers = createPhase6Managers();
    await managers.participationRepo.updateState({
      churchId: ChurchId.from(seed.churchAId),
      participationId: MinistryParticipationId.from(primary.participation.id),
      state: 'availability_fired',
    });
    await seedAssignment({
      churchId: seed.churchAId,
      participationId: overlapBranch.participation.id,
      shiftId: overlapShift.id,
      volunteerId: overlapVolunteer.volunteer.id,
      roleId: roleRow.id,
      status: 'confirmed',
    });

    const firstResult =
      await managers.assignmentManager.createParticipationAssignment({
        churchId: ChurchId.from(seed.churchAId),
        shiftId: ShiftId.from(targetShift.id),
        volunteerId: VolunteerId.from(firstVolunteer.volunteer.id),
        roleId: RoleId.from(roleRow.id),
        actorId: UserId.from(seed.adminUserId),
      });
    expect(firstResult.assignment.shiftId).toBe(targetShift.id);
    expect(firstResult.assignment.participationId).toBe(
      primary.participation.id,
    );
    expect(firstResult.warnings).toEqual([]);

    const completionAfterFirst =
      await managers.participationManager.getCompletion({
        churchId: ChurchId.from(seed.churchAId),
        participationId: MinistryParticipationId.from(primary.participation.id),
      });
    expect(completionAfterFirst.assignedCount).toBe(1);
    expect(completionAfterFirst.requiredCount).toBe(2);
    expect(completionAfterFirst.completionPercent).toBe(50);

    await expect(
      managers.assignmentManager.createParticipationAssignment({
        churchId: ChurchId.from(seed.churchAId),
        shiftId: ShiftId.from(targetShift.id),
        volunteerId: VolunteerId.from(firstVolunteer.volunteer.id),
        roleId: RoleId.from(roleRow.id),
        actorId: UserId.from(seed.adminUserId),
      }),
    ).rejects.toMatchObject({
      reason: 'DUPLICATE_ASSIGNMENT',
    });

    const softConflict =
      await managers.assignmentManager.createParticipationAssignment({
        churchId: ChurchId.from(seed.churchAId),
        shiftId: ShiftId.from(targetShift.id),
        volunteerId: VolunteerId.from(overlapVolunteer.volunteer.id),
        roleId: RoleId.from(roleRow.id),
        actorId: UserId.from(seed.adminUserId),
      });
    expect(softConflict.warnings).toEqual([
      expect.objectContaining({ type: 'DOUBLE_BOOKED' }),
    ]);

    await schedulingTestDb
      .update(ministry)
      .set({ enforcementType: 'hard' })
      .where(eq(ministry.id, seed.ministryAId));

    const hardCandidate = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Hard Override',
      email: 'hard-phase6@test.com',
    });
    await seedAssignment({
      churchId: seed.churchAId,
      participationId: overlapBranch.participation.id,
      shiftId: overlapShift.id,
      volunteerId: hardCandidate.volunteer.id,
      roleId: roleRow.id,
      status: 'confirmed',
    });

    await expect(
      managers.assignmentManager.createParticipationAssignment({
        churchId: ChurchId.from(seed.churchAId),
        shiftId: ShiftId.from(targetShift.id),
        volunteerId: VolunteerId.from(hardCandidate.volunteer.id),
        roleId: RoleId.from(roleRow.id),
        actorId: UserId.from(seed.adminUserId),
      }),
    ).rejects.toMatchObject({
      reason: 'DUPLICATE_ASSIGNMENT',
    });

    const overridden =
      await managers.assignmentManager.createParticipationAssignment({
        churchId: ChurchId.from(seed.churchAId),
        shiftId: ShiftId.from(targetShift.id),
        volunteerId: VolunteerId.from(hardCandidate.volunteer.id),
        roleId: RoleId.from(roleRow.id),
        actorId: UserId.from(seed.adminUserId),
        override: { reason: 'Leader approved staffing override' },
      });
    const audit = await managers.assignmentManager.listAuditLog({
      churchId: ChurchId.from(seed.churchAId),
      assignmentId: overridden.assignment.id,
    });

    expect(audit).toEqual([
      expect.objectContaining({
        action: 'created',
        reason: 'Leader approved staffing override',
      }),
    ]);
  });

  it('DL2-PB-01/02/03/04/05/06 publishes one participation in isolation and reveals only published slices', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'October 2026',
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      endDate: new Date('2026-11-01T00:00:00.000Z'),
      state: 'locked',
    });
    const sharedEvent = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Shared event',
      startDate: new Date('2026-10-04T09:00:00.000Z'),
      endDate: new Date('2026-10-04T11:00:00.000Z'),
      status: 'scheduled',
    });
    const [secondMinistry] = await schedulingTestDb
      .insert(ministry)
      .values({
        id: randomUUID(),
        churchId: seed.churchAId,
        name: 'Second ministry',
        enforcementType: 'soft',
      })
      .returning();
    if (!secondMinistry) {
      throw new Error('Phase 6 second ministry seed failed');
    }
    const [secondParticipation] = await schedulingTestDb
      .insert(ministryParticipation)
      .values({
        id: randomUUID(),
        churchId: seed.churchAId,
        ministryId: secondMinistry.id,
        eventId: sharedEvent.event.id,
        state: 'rostering',
      })
      .returning();
    if (!secondParticipation) {
      throw new Error('Phase 6 second participation seed failed');
    }

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
      timeSlotId: sharedEvent.slot.id,
      startTime: new Date('2026-10-04T09:00:00.000Z'),
      endTime: new Date('2026-10-04T10:00:00.000Z'),
      label: 'Primary',
    });
    const secondaryShift = await seedShift({
      churchId: seed.churchAId,
      participationId: secondParticipation.id,
      timeSlotId: sharedEvent.slot.id,
      startTime: new Date('2026-10-04T10:00:00.000Z'),
      endTime: new Date('2026-10-04T11:00:00.000Z'),
      label: 'Secondary',
    });
    await seedRequirement({
      churchId: seed.churchAId,
      participationId: sharedEvent.participation.id,
      shiftId: primaryShift.id,
      roleId: roleA.id,
      requiredCount: 2,
    });
    await seedRequirement({
      churchId: seed.churchAId,
      participationId: secondParticipation.id,
      shiftId: secondaryShift.id,
      roleId: roleB.id,
      requiredCount: 1,
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

    const managers = createPhase6Managers();
    await managers.participationRepo.updateState({
      churchId: ChurchId.from(seed.churchAId),
      participationId: MinistryParticipationId.from(
        sharedEvent.participation.id,
      ),
      state: 'rostering',
    });

    const publishedCandidate = await seedAssignment({
      churchId: seed.churchAId,
      participationId: sharedEvent.participation.id,
      shiftId: primaryShift.id,
      volunteerId: primaryVolunteer.volunteer.id,
      roleId: roleA.id,
      status: 'pending',
    });
    await seedAssignment({
      churchId: seed.churchAId,
      participationId: secondParticipation.id,
      shiftId: secondaryShift.id,
      volunteerId: secondVolunteer.volunteer.id,
      roleId: roleB.id,
      status: 'pending',
    });
    await seedAssignment({
      churchId: seed.churchAId,
      participationId: secondParticipation.id,
      shiftId: secondaryShift.id,
      volunteerId: floatingVolunteer.volunteer.id,
      roleId: roleB.id,
      status: 'pending',
    });

    await expect(
      managers.participationManager.publish({
        churchId: ChurchId.from(seed.churchAId),
        participationId: MinistryParticipationId.from(
          sharedEvent.participation.id,
        ),
      }),
    ).rejects.toBeInstanceOf(BelowFullPublishError);

    await managers.participationManager.publish({
      churchId: ChurchId.from(seed.churchAId),
      participationId: MinistryParticipationId.from(
        sharedEvent.participation.id,
      ),
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
    expect(sibling.state).toBe('rostering');

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

  it('DL2-DS-01 maps same-role rows to the correct teams in ministry schedule without claimedAssignmentIds workarounds', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'November 2026',
      startDate: new Date('2026-11-01T00:00:00.000Z'),
      endDate: new Date('2026-12-01T00:00:00.000Z'),
      state: 'locked',
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Team-attributed service',
      startDate: new Date('2026-11-08T09:00:00.000Z'),
      endDate: new Date('2026-11-08T11:00:00.000Z'),
      status: 'scheduled',
    });
    const hostRole = await seedRole({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Host',
    });
    const alphaTeam = await seedTeam({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Alpha Team',
    });
    const betaTeam = await seedTeam({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Beta Team',
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
      teamId: alphaTeam.id,
    });
    const betaVolunteer = await seedVolunteerMembership({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Bobby Beta',
      email: 'bobby-phase6@test.com',
      teamId: betaTeam.id,
    });
    const shift = await seedShift({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      timeSlotId: graph.slot.id,
      startTime: new Date('2026-11-08T09:00:00.000Z'),
      endTime: new Date('2026-11-08T10:00:00.000Z'),
      label: 'Front doors',
    });
    await seedRequirement({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      roleId: hostRole.id,
      teamId: alphaTeam.id,
      requiredCount: 1,
    });
    await seedRequirement({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      roleId: hostRole.id,
      teamId: betaTeam.id,
      requiredCount: 1,
    });
    await seedAssignment({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      volunteerId: alphaVolunteer.volunteer.id,
      roleId: hostRole.id,
      status: 'confirmed',
    });
    await seedAssignment({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shift.id,
      volunteerId: betaVolunteer.volunteer.id,
      roleId: hostRole.id,
      status: 'pending',
    });

    const managers = createPhase6Managers();
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
          teamName: 'Alpha Team',
          volunteerDisplayName: 'Alice A.',
          confirmationState: 'confirmed',
        }),
        expect.objectContaining({
          roleName: 'Host',
          teamName: 'Beta Team',
          volunteerDisplayName: 'Bobby B.',
          confirmationState: 'pending',
        }),
      ]),
    );
  });
});
