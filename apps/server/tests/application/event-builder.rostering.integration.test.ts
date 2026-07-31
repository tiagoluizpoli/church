import { randomUUID } from 'node:crypto';
import {
  assignmentAudit as assignmentAuditTable,
  assignment as assignmentTable,
  ministryParticipation,
  ministryVolunteerRole as ministryVolunteerRoleTable,
  ministryVolunteer as ministryVolunteerTable,
  role as roleTable,
  shift as shiftTable,
  slotRequirement as slotRequirementTable,
  user as userTable,
  volunteer as volunteerTable,
} from '@church/db';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { DbAssignmentManager } from '../../src/application/db-assignment-manager';
import { DbParticipationManager } from '../../src/application/db-participation-manager';
import {
  ChurchId,
  MinistryId,
  MinistryParticipationId,
  PlanningCycleId,
  RoleId,
  ShiftId,
  UserId,
  VolunteerId,
} from '../../src/domain/branded-ids';
import { DrizzleAssignmentRepository } from '../../src/infrastructure/repositories/drizzle-assignment.repository';
import { DrizzleAssignmentAuditRepository } from '../../src/infrastructure/repositories/drizzle-assignment-audit.repository';
import { DrizzleAvailabilityRepository } from '../../src/infrastructure/repositories/drizzle-availability.repository';
import { DrizzleMinistryRepository } from '../../src/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleMinistryParticipationRepository } from '../../src/infrastructure/repositories/drizzle-ministry-participation.repository';
import { DrizzleMinistryServingProfileRepository } from '../../src/infrastructure/repositories/drizzle-ministry-serving-profile.repository';
import { DrizzlePlanningEventRepository } from '../../src/infrastructure/repositories/drizzle-planning-event.repository';
import { DrizzleRoleRepository } from '../../src/infrastructure/repositories/drizzle-role.repository';
import { DrizzleShiftRepository } from '../../src/infrastructure/repositories/drizzle-shift.repository';
import { DrizzleTimeSlotRepository } from '../../src/infrastructure/repositories/drizzle-time-slot.repository';
import { DrizzleUnitOfWork } from '../../src/infrastructure/repositories/drizzle-unit-of-work';
import { DrizzleVolunteerRepository } from '../../src/infrastructure/repositories/drizzle-volunteer.repository';
import { createNotificationServiceSpy } from '../../src/test-support/notification-service-spy';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '../scheduling-reshape/setup';

function createParticipationManager(): DbParticipationManager {
  const unitOfWork = new DrizzleUnitOfWork({ db: schedulingTestDb });
  return new DbParticipationManager(
    new DrizzleMinistryParticipationRepository({ db: schedulingTestDb }),
    new DrizzleShiftRepository({ db: schedulingTestDb }),
    new DrizzlePlanningEventRepository({ db: schedulingTestDb }),
    new DrizzleAssignmentRepository({ db: schedulingTestDb }),
    new DrizzleAvailabilityRepository({ db: schedulingTestDb }),
    new DrizzleTimeSlotRepository({ db: schedulingTestDb }),
    new DrizzleVolunteerRepository({ db: schedulingTestDb }),
    new DrizzleMinistryRepository({ db: schedulingTestDb }),
    new DrizzleMinistryServingProfileRepository({ db: schedulingTestDb }),
    new DrizzleRoleRepository({ db: schedulingTestDb }),
    createNotificationServiceSpy(),
    unitOfWork,
  );
}

function createAssignmentManager(): DbAssignmentManager {
  const unitOfWork = new DrizzleUnitOfWork({ db: schedulingTestDb });
  return new DbAssignmentManager(
    new DrizzleAssignmentRepository({ db: schedulingTestDb }),
    new DrizzleAssignmentAuditRepository({ db: schedulingTestDb }),
    new DrizzleShiftRepository({ db: schedulingTestDb }),
    new DrizzleMinistryParticipationRepository({ db: schedulingTestDb }),
    new DrizzleMinistryRepository({ db: schedulingTestDb }),
    new DrizzleVolunteerRepository({ db: schedulingTestDb }),
    new DrizzleAvailabilityRepository({ db: schedulingTestDb }),
    new DrizzlePlanningEventRepository({ db: schedulingTestDb }),
    createNotificationServiceSpy(),
    unitOfWork,
  );
}

interface SeedShiftInput {
  churchId: string;
  participationId: string;
  timeSlotId: string;
  startTime: Date;
  endTime: Date;
}

async function seedShift(input: SeedShiftInput): Promise<string> {
  const shiftId = randomUUID();
  await schedulingTestDb.insert(shiftTable).values({
    id: shiftId,
    churchId: input.churchId,
    participationId: input.participationId,
    timeSlotId: input.timeSlotId,
    startTime: input.startTime,
    endTime: input.endTime,
  });
  return shiftId;
}

interface SeedRequirementInput {
  churchId: string;
  ministryId: string;
  participationId: string;
  shiftId: string;
}

async function seedRoleRequirement(
  input: SeedRequirementInput,
): Promise<string> {
  const roleId = randomUUID();
  await schedulingTestDb.insert(roleTable).values({
    id: roleId,
    churchId: input.churchId,
    ministryId: input.ministryId,
    name: 'Greeter',
  });
  await schedulingTestDb.insert(slotRequirementTable).values({
    id: randomUUID(),
    churchId: input.churchId,
    participationId: input.participationId,
    shiftId: input.shiftId,
    roleId,
    requiredCount: 2,
  });
  return roleId;
}

interface SeedQualificationInput {
  churchId: string;
  ministryId: string;
  volunteerId: string;
  roleId: string;
}

/** Grants a real `ministry_volunteer_role` row for the member's membership. */
async function seedRoleQualification(
  input: SeedQualificationInput,
): Promise<void> {
  const membership = await schedulingTestDb
    .select({ id: ministryVolunteerTable.id })
    .from(ministryVolunteerTable)
    .where(
      and(
        eq(ministryVolunteerTable.churchId, input.churchId),
        eq(ministryVolunteerTable.ministryId, input.ministryId),
        eq(ministryVolunteerTable.volunteerId, input.volunteerId),
      ),
    );
  const membershipId = membership[0]?.id;
  if (!membershipId) {
    throw new Error('No membership to qualify');
  }
  await schedulingTestDb.insert(ministryVolunteerRoleTable).values({
    churchId: input.churchId,
    ministryVolunteerId: membershipId,
    roleId: input.roleId,
  });
}

interface SeedUnqualifiedMemberInput {
  churchId: string;
  ministryId: string;
  name: string;
  email: string;
}

interface SeedUnqualifiedMemberResult {
  volunteerId: string;
}

/**
 * Seeds an active ministry member who holds no `ministry_volunteer_role`
 * row at all — membership alone must not confer qualification for any role.
 */
async function seedUnqualifiedMember(
  input: SeedUnqualifiedMemberInput,
): Promise<SeedUnqualifiedMemberResult> {
  const userId = randomUUID();
  const volunteerId = randomUUID();

  await schedulingTestDb.insert(userTable).values({
    id: userId,
    name: input.name,
    email: input.email,
    emailVerified: true,
  });

  await schedulingTestDb.insert(volunteerTable).values({
    id: volunteerId,
    churchId: input.churchId,
    userId,
    status: 'active',
  });

  await schedulingTestDb.insert(ministryVolunteerTable).values({
    id: randomUUID(),
    churchId: input.churchId,
    ministryId: input.ministryId,
    volunteerId,
    ministryAccessLevel: 'volunteer',
    status: 'active',
  });

  return { volunteerId };
}

const CYCLE_START = new Date('2026-08-01T00:00:00.000Z');
const CYCLE_END = new Date('2026-09-01T00:00:00.000Z');
const EVENT_START = new Date('2026-08-02T12:00:00.000Z');
const EVENT_END = new Date('2026-08-02T15:00:00.000Z');

describe('DbParticipationManager.getCycleBuilderData (R1 integration)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('returns a uniform event→slot→shift shape with assignments [] for a zero-assignment shift', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'Builder Cycle',
      startDate: CYCLE_START,
      endDate: CYCLE_END,
      state: 'locked',
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Sunday Service',
      startDate: EVENT_START,
      endDate: EVENT_END,
    });
    const shiftId = await seedShift({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      timeSlotId: graph.slot.id,
      startTime: EVENT_START,
      endTime: EVENT_END,
    });
    await seedRoleRequirement({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      participationId: graph.participation.id,
      shiftId,
    });

    const manager = createParticipationManager();
    const view = await manager.getCycleBuilderData({
      churchId: ChurchId.from(seed.churchAId),
      cycleId: PlanningCycleId.from(cycle.id),
      ministryId: MinistryId.from(seed.ministryAId),
      userId: UserId.from(seed.adminUserId),
    });

    expect(view.events).toHaveLength(1);
    const [eventView] = view.events;
    expect(eventView?.event.id).toBe(graph.event.id);
    const shiftView = eventView?.slots
      .flatMap((slot) => slot.shifts)
      .find((shift) => (shift.shift.id as string) === shiftId);
    expect(shiftView).toBeDefined();
    expect(shiftView?.assignments).toEqual([]);
    expect(shiftView?.requirements).toHaveLength(1);
    expect(Array.isArray(shiftView?.eligibleVolunteers)).toBe(true);
    expect(view.roles).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Greeter' })]),
    );
  });

  it('carries each eligible volunteer\u2019s qualified role ids (023 phase 6)', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'Qualification Cycle',
      startDate: CYCLE_START,
      endDate: CYCLE_END,
      state: 'locked',
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Sunday Service',
      startDate: EVENT_START,
      endDate: EVENT_END,
    });
    const shiftId = await seedShift({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      timeSlotId: graph.slot.id,
      startTime: EVENT_START,
      endTime: EVENT_END,
    });
    const roleId = await seedRoleRequirement({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      participationId: graph.participation.id,
      shiftId,
    });
    await seedRoleQualification({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      volunteerId: seed.adminVolunteerId,
      roleId,
    });

    const manager = createParticipationManager();
    const view = await manager.getCycleBuilderData({
      churchId: ChurchId.from(seed.churchAId),
      cycleId: PlanningCycleId.from(cycle.id),
      ministryId: MinistryId.from(seed.ministryAId),
      userId: UserId.from(seed.adminUserId),
    });

    const shiftView = view.events
      .flatMap((eventView) => eventView.slots)
      .flatMap((slot) => slot.shifts)
      .find((shift) => (shift.shift.id as string) === shiftId);
    const eligible = shiftView?.eligibleVolunteers.find(
      (volunteer) =>
        (volunteer.volunteerId as string) === seed.adminVolunteerId,
    );

    // The member is only a candidate because of the qualification row, so the
    // payload must also say which role earned them the place.
    expect(eligible).toBeDefined();
    expect(eligible?.qualifiedRoleIds).toEqual([roleId]);
    // seedSchedulingPhase3Base seeds the admin volunteer's ministry
    // membership with ministryAccessLevel 'leader' and no team memberships —
    // the eligible-volunteer view must carry that through so the builder can
    // tell ministry-wide "Leader" apart from a team-scoped TeamLeader.
    expect(eligible?.ministryAccessLevel).toBe('leader');
    expect(eligible?.leadTeamIds).toEqual([]);
  });

  it('returns the same builder shape for a published participation shift', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'Published Cycle',
      startDate: CYCLE_START,
      endDate: CYCLE_END,
      state: 'locked',
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Published Service',
      startDate: EVENT_START,
      endDate: EVENT_END,
    });
    const shiftId = await seedShift({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      timeSlotId: graph.slot.id,
      startTime: EVENT_START,
      endTime: EVENT_END,
    });
    await new DrizzleMinistryParticipationRepository({
      db: schedulingTestDb,
    }).updateState({
      churchId: ChurchId.from(seed.churchAId),
      participationId: MinistryParticipationId.from(graph.participation.id),
      state: 'published',
    });

    const manager = createParticipationManager();
    const view = await manager.getCycleBuilderData({
      churchId: ChurchId.from(seed.churchAId),
      cycleId: PlanningCycleId.from(cycle.id),
      ministryId: MinistryId.from(seed.ministryAId),
      userId: UserId.from(seed.adminUserId),
    });

    const shiftView = view.events
      .flatMap((event) => event.slots)
      .flatMap((slot) => slot.shifts)
      .find((shift) => (shift.shift.id as string) === shiftId);
    expect(Array.isArray(shiftView?.eligibleVolunteers)).toBe(true);
  });

  it('church isolation: church B cannot read church A cycle builder data (R8)', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'Isolated Cycle',
      startDate: CYCLE_START,
      endDate: CYCLE_END,
      state: 'locked',
    });
    await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Church A Service',
      startDate: EVENT_START,
      endDate: EVENT_END,
    });

    const manager = createParticipationManager();
    const view = await manager.getCycleBuilderData({
      churchId: ChurchId.from(seed.churchBId),
      cycleId: PlanningCycleId.from(cycle.id),
      ministryId: MinistryId.from(seed.ministryBId),
      userId: UserId.from(seed.adminUserId),
    });

    expect(view.events).toEqual([]);
  });
});

describe('Ministry-scoped role qualification gating (H4 regression)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('excludes an unqualified ministry member from shift eligibility and flags their assignment as NOT_QUALIFIED', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'Qualification Gate Cycle',
      startDate: CYCLE_START,
      endDate: CYCLE_END,
      state: 'locked',
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Sunday Service',
      startDate: EVENT_START,
      endDate: EVENT_END,
    });
    const shiftId = await seedShift({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      timeSlotId: graph.slot.id,
      startTime: EVENT_START,
      endTime: EVENT_END,
    });
    const roleId = await seedRoleRequirement({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      participationId: graph.participation.id,
      shiftId,
    });

    // Active ministry member with no `ministry_volunteer_role` row for
    // `roleId` — membership alone must not confer candidacy.
    const unqualified = await seedUnqualifiedMember({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Unqualified Member',
      email: 'unqualified-h4@test.com',
    });

    const participationManager = createParticipationManager();
    const view = await participationManager.getCycleBuilderData({
      churchId: ChurchId.from(seed.churchAId),
      cycleId: PlanningCycleId.from(cycle.id),
      ministryId: MinistryId.from(seed.ministryAId),
      userId: UserId.from(seed.adminUserId),
    });

    const shiftView = view.events
      .flatMap((eventView) => eventView.slots)
      .flatMap((slot) => slot.shifts)
      .find((shift) => (shift.shift.id as string) === shiftId);
    expect(shiftView).toBeDefined();
    expect(
      shiftView?.eligibleVolunteers.some(
        (volunteer) =>
          (volunteer.volunteerId as string) === unqualified.volunteerId,
      ),
    ).toBe(false);

    const assignmentManager = createAssignmentManager();
    const result = await assignmentManager.createParticipationAssignment({
      churchId: ChurchId.from(seed.churchAId),
      shiftId: ShiftId.from(shiftId),
      volunteerId: VolunteerId.from(unqualified.volunteerId),
      roleId: RoleId.from(roleId),
      actorId: UserId.from(seed.adminUserId),
    });

    // The gate is `hasRoleQualification`, ministry-scoped since the
    // qualification-check bug fix — membership without an explicit role
    // grant surfaces as a NOT_QUALIFIED warning on the assignment attempt.
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'NOT_QUALIFIED' }),
      ]),
    );
  });
});

interface SeedPublishableInput {
  churchId: string;
  ministryId: string;
  cycleName: string;
}

async function seedRosteringCycleBelowFull(input: SeedPublishableInput) {
  const cycle = await createSchedulingPhase3Cycle({
    churchId: input.churchId,
    name: input.cycleName,
    startDate: CYCLE_START,
    endDate: CYCLE_END,
    state: 'locked',
  });
  const graph = await createSchedulingPhase3EventGraph({
    churchId: input.churchId,
    cycleId: cycle.id,
    ministryId: input.ministryId,
    title: 'Publishable Service',
    startDate: EVENT_START,
    endDate: EVENT_END,
  });
  const shiftId = await seedShift({
    churchId: input.churchId,
    participationId: graph.participation.id,
    timeSlotId: graph.slot.id,
    startTime: EVENT_START,
    endTime: EVENT_END,
  });
  // requiredCount 2, zero assignments -> below full.
  await seedRoleRequirement({
    churchId: input.churchId,
    ministryId: input.ministryId,
    participationId: graph.participation.id,
    shiftId,
  });
  // Move the participation into a publishable state.
  await schedulingTestDb
    .update(ministryParticipation)
    .set({ state: 'rostering' })
    .where(eq(ministryParticipation.id, graph.participation.id));

  return { cycle, participationId: graph.participation.id };
}

async function readParticipationState(
  participationId: string,
): Promise<string> {
  const [row] = await schedulingTestDb
    .select({ state: ministryParticipation.state })
    .from(ministryParticipation)
    .where(eq(ministryParticipation.id, participationId));
  return row?.state ?? 'missing';
}

describe('DbParticipationManager.publishCycle (R7 integration)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('below-full without confirmation returns belowFull:true and makes no state change', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { cycle, participationId } = await seedRosteringCycleBelowFull({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      cycleName: 'Below Full Cycle',
    });

    const manager = createParticipationManager();
    const result = await manager.publishCycle({
      churchId: ChurchId.from(seed.churchAId),
      cycleId: PlanningCycleId.from(cycle.id),
      ministryId: MinistryId.from(seed.ministryAId),
      userId: UserId.from(seed.adminUserId),
    });

    expect(result.published).toBe(false);
    expect(result.belowFull).toBe(true);
    expect(await readParticipationState(participationId)).toBe('rostering');
  });

  it('below-full with confirmation publishes every participation atomically', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { cycle, participationId } = await seedRosteringCycleBelowFull({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      cycleName: 'Confirmed Cycle',
    });

    const manager = createParticipationManager();
    const result = await manager.publishCycle({
      churchId: ChurchId.from(seed.churchAId),
      cycleId: PlanningCycleId.from(cycle.id),
      ministryId: MinistryId.from(seed.ministryAId),
      userId: UserId.from(seed.adminUserId),
      confirmBelowFull: true,
    });

    expect(result.published).toBe(true);
    expect(result.belowFull).toBe(true);
    expect(result.participations).toHaveLength(1);
    expect(result.participations[0]?.state).toBe('published');
    expect(await readParticipationState(participationId)).toBe('published');
  });

  it('church isolation: church B cannot publish church A participations (R8)', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { cycle, participationId } = await seedRosteringCycleBelowFull({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      cycleName: 'Isolated Publish Cycle',
    });

    const manager = createParticipationManager();
    const result = await manager.publishCycle({
      churchId: ChurchId.from(seed.churchBId),
      cycleId: PlanningCycleId.from(cycle.id),
      ministryId: MinistryId.from(seed.ministryBId),
      userId: UserId.from(seed.adminUserId),
      confirmBelowFull: true,
    });

    expect(result.participations).toEqual([]);
    expect(await readParticipationState(participationId)).toBe('rostering');
  });
});

describe('DrizzleAssignmentAuditRepository.listByCycle (R5 integration)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('returns cycle-wide audit entries for one ministry and is church-isolated', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'Audit Cycle',
      startDate: CYCLE_START,
      endDate: CYCLE_END,
      state: 'locked',
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Audited Service',
      startDate: EVENT_START,
      endDate: EVENT_END,
    });
    const shiftId = await seedShift({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      timeSlotId: graph.slot.id,
      startTime: EVENT_START,
      endTime: EVENT_END,
    });
    const roleId = randomUUID();
    await schedulingTestDb.insert(roleTable).values({
      id: roleId,
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Usher',
    });
    const assignmentId = randomUUID();
    await schedulingTestDb.insert(assignmentTable).values({
      id: assignmentId,
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId,
      volunteerId: seed.adminVolunteerId,
      roleId,
      status: 'confirmed',
      assignedAt: new Date('2026-08-01T10:00:00.000Z'),
      assignedBy: seed.adminUserId,
    });
    await schedulingTestDb.insert(assignmentAuditTable).values({
      id: randomUUID(),
      churchId: seed.churchAId,
      assignmentId,
      actorId: seed.adminUserId,
      action: 'created',
      timestamp: new Date('2026-08-01T10:00:00.000Z'),
    });

    const repo = new DrizzleAssignmentAuditRepository({ db: schedulingTestDb });
    const items = await repo.listByCycle({
      churchId: ChurchId.from(seed.churchAId),
      cycleId: PlanningCycleId.from(cycle.id),
      ministryId: MinistryId.from(seed.ministryAId),
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.assignmentId).toBe(assignmentId);

    const churchBItems = await repo.listByCycle({
      churchId: ChurchId.from(seed.churchBId),
      cycleId: PlanningCycleId.from(cycle.id),
      ministryId: MinistryId.from(seed.ministryBId),
    });
    expect(churchBItems).toEqual([]);
  });
});
