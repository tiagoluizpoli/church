import { randomUUID } from 'node:crypto';
import {
  assignmentAudit as assignmentAuditTable,
  assignment as assignmentTable,
  ministryParticipation,
  role as roleTable,
  shift as shiftTable,
  slotRequirement as slotRequirementTable,
} from '@church/db';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { DbParticipationManager } from '../../src/application/db-participation-manager';
import {
  ChurchId,
  MinistryId,
  MinistryParticipationId,
  PlanningCycleId,
  UserId,
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
  const unitOfWork = new DrizzleUnitOfWork(schedulingTestDb);
  return new DbParticipationManager(
    new DrizzleMinistryParticipationRepository(schedulingTestDb),
    new DrizzleShiftRepository(schedulingTestDb),
    new DrizzlePlanningEventRepository(schedulingTestDb),
    new DrizzleAssignmentRepository(schedulingTestDb),
    new DrizzleAvailabilityRepository(schedulingTestDb),
    new DrizzleTimeSlotRepository(schedulingTestDb),
    new DrizzleVolunteerRepository(schedulingTestDb),
    new DrizzleMinistryRepository(schedulingTestDb),
    new DrizzleMinistryServingProfileRepository(schedulingTestDb),
    new DrizzleRoleRepository(schedulingTestDb),
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

async function seedRoleRequirement(input: SeedRequirementInput): Promise<void> {
  const roleId = randomUUID();
  await schedulingTestDb.insert(roleTable).values({
    id: roleId,
    churchId: input.churchId,
    ministryId: input.ministryId,
    name: 'Greeter',
    isGlobal: false,
  });
  await schedulingTestDb.insert(slotRequirementTable).values({
    id: randomUUID(),
    churchId: input.churchId,
    participationId: input.participationId,
    shiftId: input.shiftId,
    roleId,
    requiredCount: 2,
  });
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
    await new DrizzleMinistryParticipationRepository(
      schedulingTestDb,
    ).updateState({
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
      isGlobal: false,
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

    const repo = new DrizzleAssignmentAuditRepository(schedulingTestDb);
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
