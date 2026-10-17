import {
  assignment as assignmentTable,
  ministryMembership as ministryMembershipTable,
  ministryParticipation,
} from '@church/db';
import { fromDate, parseInstant } from '@church/time';
import { and, eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { DbAssignmentManager } from '@/application/db-assignment-manager';
import { DbParticipationManager } from '@/application/db-participation-manager';
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
import { HardConstraintError } from '@/domain/conflict/errors/hard-constraint-error';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import { DrizzleAssignmentRepository } from '@/infrastructure/repositories/drizzle-assignment.repository';
import { DrizzleAssignmentAuditRepository } from '@/infrastructure/repositories/drizzle-assignment-audit.repository';
import { DrizzleEventTimeBlockRepository } from '@/infrastructure/repositories/drizzle-event-time-block.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleMinistryParticipationRepository } from '@/infrastructure/repositories/drizzle-ministry-participation.repository';
import { DrizzlePlanningEventRepository } from '@/infrastructure/repositories/drizzle-planning-event.repository';
import { DrizzleRoleRepository } from '@/infrastructure/repositories/drizzle-role.repository';
import { DrizzleSectorRepository } from '@/infrastructure/repositories/drizzle-sector.repository';
import { DrizzleShiftRepository } from '@/infrastructure/repositories/drizzle-shift.repository';
import { DrizzleTransactionContext } from '@/infrastructure/repositories/drizzle-transaction-context';
import { DrizzleUnavailableShiftRepository } from '@/infrastructure/repositories/drizzle-unavailable-shift.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { DrizzleUsualSetupRepository } from '@/infrastructure/repositories/drizzle-usual-setup.repository';
import { DrizzleVolunteerRepository } from '@/infrastructure/repositories/drizzle-volunteer.repository';
import type { AnyDrizzleDb } from '@/infrastructure/repositories/types';
import { buildRole, buildSector } from '@/seeds/builders/ministry';
import {
  buildAssignment,
  buildAssignmentAudit,
  buildShift,
  buildShiftRequirement,
} from '@/seeds/builders/scheduling';
import {
  buildRoleQualification,
  buildVolunteerWithMembership,
} from '@/seeds/builders/volunteer';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  resetSchedulingPhase3Db,
  schedulingTestDb,
  schedulingTestPool,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';
import { createNotificationServiceSpy } from '@/tests/test-support/notification-service-spy';

function createParticipationManager(): DbParticipationManager {
  const unitOfWork = new DrizzleUnitOfWork({ db: schedulingTestDb });
  return new DbParticipationManager({
    participationRepository: new DrizzleMinistryParticipationRepository({
      db: schedulingTestDb,
    }),
    shiftRepository: new DrizzleShiftRepository({ db: schedulingTestDb }),
    eventRepository: new DrizzlePlanningEventRepository({
      db: schedulingTestDb,
    }),
    assignmentRepository: new DrizzleAssignmentRepository({
      db: schedulingTestDb,
    }),
    unavailableShiftRepository: new DrizzleUnavailableShiftRepository({
      db: schedulingTestDb,
    }),
    eventTimeBlockRepository: new DrizzleEventTimeBlockRepository({
      db: schedulingTestDb,
    }),
    volunteerRepository: new DrizzleVolunteerRepository({
      db: schedulingTestDb,
    }),
    ministryRepository: new DrizzleMinistryRepository({ db: schedulingTestDb }),
    usualSetupRepository: new DrizzleUsualSetupRepository({
      db: schedulingTestDb,
    }),
    roleRepository: new DrizzleRoleRepository({ db: schedulingTestDb }),
    sectorRepository: new DrizzleSectorRepository({ db: schedulingTestDb }),
    notificationService: createNotificationServiceSpy(),
    unitOfWork,
  });
}

function createAssignmentManager(input?: {
  volunteerRepository?: DrizzleVolunteerRepository;
}): DbAssignmentManager {
  const unitOfWork = new DrizzleUnitOfWork({ db: schedulingTestDb });
  return new DbAssignmentManager({
    assignmentRepo: new DrizzleAssignmentRepository({ db: schedulingTestDb }),
    auditRepo: new DrizzleAssignmentAuditRepository({ db: schedulingTestDb }),
    shiftRepository: new DrizzleShiftRepository({ db: schedulingTestDb }),
    participationRepository: new DrizzleMinistryParticipationRepository({
      db: schedulingTestDb,
    }),
    volunteerRepository:
      input?.volunteerRepository ??
      new DrizzleVolunteerRepository({ db: schedulingTestDb }),
    unavailableShiftRepository: new DrizzleUnavailableShiftRepository({
      db: schedulingTestDb,
    }),
    planningEventRepository: new DrizzlePlanningEventRepository({
      db: schedulingTestDb,
    }),
    notificationService: createNotificationServiceSpy(),
    unitOfWork,
  });
}

interface SeedShiftInput {
  churchId: string;
  participationId: string;
  eventTimeBlockId: string;
  startTime: Date;
  endTime: Date;
}

async function seedShift(input: SeedShiftInput): Promise<string> {
  const shiftRow = await buildShift({
    db: schedulingTestDb,
    churchId: input.churchId,
    participationId: input.participationId,
    eventTimeBlockId: input.eventTimeBlockId,
    start: fromDate({ date: input.startTime }),
    end: fromDate({ date: input.endTime }),
  });
  return shiftRow.id;
}

interface SeedRequirementInput {
  churchId: string;
  ministryId: string;
  participationId: string;
  shiftId: string;
}

async function seedRoleRequirement(
  input: SeedRequirementInput,
): Promise<{ roleId: string; shiftRequirementId: string }> {
  const greeter = await buildRole({
    db: schedulingTestDb,
    churchId: input.churchId,
    ministryId: input.ministryId,
    name: 'Greeter',
  });
  const stage = await buildSector({
    db: schedulingTestDb,
    churchId: input.churchId,
    ministryId: input.ministryId,
    name: 'Geral',
  });
  const requirement = await buildShiftRequirement({
    db: schedulingTestDb,
    churchId: input.churchId,
    participationId: input.participationId,
    shiftId: input.shiftId,
    roleId: greeter.id,
    sectorId: stage.id,
    peopleNeeded: 2,
  });
  return { roleId: greeter.id, shiftRequirementId: requirement.id };
}

interface SeedQualificationInput {
  churchId: string;
  ministryId: string;
  volunteerId: string;
  roleId: string;
}

/** Grants a real `ministry_membership_role` row for the member's membership. */
async function seedRoleQualification(
  input: SeedQualificationInput,
): Promise<void> {
  const membership = await schedulingTestDb
    .select({ id: ministryMembershipTable.id })
    .from(ministryMembershipTable)
    .where(
      and(
        eq(ministryMembershipTable.churchId, input.churchId),
        eq(ministryMembershipTable.ministryId, input.ministryId),
        eq(ministryMembershipTable.volunteerId, input.volunteerId),
      ),
    );
  const membershipId = membership[0]?.id;
  if (!membershipId) {
    throw new Error('No membership to qualify');
  }
  await buildRoleQualification({
    db: schedulingTestDb,
    churchId: input.churchId,
    ministryMembershipId: membershipId,
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
 * Seeds an active ministry member who holds no `ministry_membership_role`
 * row at all — membership alone must not confer qualification for any role.
 */
async function seedUnqualifiedMember(
  input: SeedUnqualifiedMemberInput,
): Promise<SeedUnqualifiedMemberResult> {
  const { volunteer } = await buildVolunteerWithMembership({
    db: schedulingTestDb,
    churchId: input.churchId,
    ministryId: input.ministryId,
    name: input.name,
    email: input.email,
  });

  return { volunteerId: volunteer.id };
}

const CYCLE_START = new Date('2026-08-01T00:00:00.000Z');
const CYCLE_END = new Date('2026-09-01T00:00:00.000Z');
const EVENT_START = new Date('2026-08-02T12:00:00.000Z');
const EVENT_END = new Date('2026-08-02T15:00:00.000Z');
const ASSIGN_LOCK_WAIT_TIMEOUT_MS = 10_000;
const LOCK_WAIT_POLL_INTERVAL_MS = 10;

interface LockedAssignQueryRow {
  isBlocked: boolean;
}

interface AssignLockObserverInput {
  assignBackendPid: number;
  sweepBackendPid: number;
}

class AssignTrackingVolunteerRepository extends DrizzleVolunteerRepository {
  constructor(
    private readonly onAssignBackendPid: (backendPid: number) => void,
  ) {
    super({ db: schedulingTestDb });
  }

  override async hasMembershipInMinistry(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    ministryId: MinistryId,
    tx?: TransactionContext,
  ): Promise<boolean> {
    if (!(tx instanceof DrizzleTransactionContext)) {
      throw new Error('Assign membership check did not receive a transaction');
    }
    const result = await tx.tx.execute(
      sql`SELECT pg_backend_pid() AS "backendPid"`,
    );
    this.onAssignBackendPid(readBackendPid(result));
    return super.hasMembershipInMinistry(churchId, volunteerId, ministryId, tx);
  }
}

function readBackendPid(result: { rows: Record<string, unknown>[] }): number {
  const backendPid = result.rows[0]?.backendPid;
  if (typeof backendPid !== 'number') {
    throw new Error('Could not identify the transaction backend');
  }
  return backendPid;
}

async function waitForAssignMembershipLock(
  input: AssignLockObserverInput,
): Promise<void> {
  const deadline = Date.now() + ASSIGN_LOCK_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { rows } = await schedulingTestPool.query<LockedAssignQueryRow>(
      `
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity activity
        WHERE activity.pid = $1
          AND activity.state = 'active'
          AND activity.wait_event_type = 'Lock'
          AND $2 = ANY(pg_blocking_pids(activity.pid))
      ) AS "isBlocked"
    `,
      [input.assignBackendPid, input.sweepBackendPid],
    );
    if (rows[0]?.isBlocked) {
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, LOCK_WAIT_POLL_INTERVAL_MS);
    });
  }
  throw new Error(
    'Assign membership query did not block on the transfer sweep within 10 seconds',
  );
}

describe('DbParticipationManager.getCycleBuilderData (R1 integration)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('returns a uniform event→event time block→shift shape with assignments [] for a zero-assignment shift', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'Builder Cycle',
      startDate: CYCLE_START,
      endDate: CYCLE_END,
      state: 'sent',
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Sunday Service',
      start: EVENT_START,
      end: EVENT_END,
    });
    const shiftId = await seedShift({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      eventTimeBlockId: graph.eventTimeBlock.id,
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
      cycleId: CycleId.from(cycle.id),
      ministryId: MinistryId.from(seed.ministryAId),
      userId: UserId.from(seed.adminUserId),
    });

    expect(view.events).toHaveLength(1);
    const [eventView] = view.events;
    expect(eventView?.event.id).toBe(graph.event.id);
    const shiftView = eventView?.eventTimeBlocks
      .flatMap((eventTimeBlock) => eventTimeBlock.shifts)
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
      state: 'sent',
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Sunday Service',
      start: EVENT_START,
      end: EVENT_END,
    });
    const shiftId = await seedShift({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      eventTimeBlockId: graph.eventTimeBlock.id,
      startTime: EVENT_START,
      endTime: EVENT_END,
    });
    const { roleId } = await seedRoleRequirement({
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
      cycleId: CycleId.from(cycle.id),
      ministryId: MinistryId.from(seed.ministryAId),
      userId: UserId.from(seed.adminUserId),
    });

    const shiftView = view.events
      .flatMap((eventView) => eventView.eventTimeBlocks)
      .flatMap((eventTimeBlock) => eventTimeBlock.shifts)
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
    // membership with ministryAccessLevel 'leader' — the eligible-volunteer
    // view must carry that through so the builder can badge the Leader.
    expect(eligible?.ministryAccessLevel).toBe('leader');
  });

  it('returns the same builder shape for a published participation shift', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'Published Cycle',
      startDate: CYCLE_START,
      endDate: CYCLE_END,
      state: 'sent',
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Published Service',
      start: EVENT_START,
      end: EVENT_END,
    });
    const shiftId = await seedShift({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      eventTimeBlockId: graph.eventTimeBlock.id,
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
      cycleId: CycleId.from(cycle.id),
      ministryId: MinistryId.from(seed.ministryAId),
      userId: UserId.from(seed.adminUserId),
    });

    const shiftView = view.events
      .flatMap((event) => event.eventTimeBlocks)
      .flatMap((eventTimeBlock) => eventTimeBlock.shifts)
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
      state: 'sent',
    });
    await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Church A Service',
      start: EVENT_START,
      end: EVENT_END,
    });

    const manager = createParticipationManager();
    const view = await manager.getCycleBuilderData({
      churchId: ChurchId.from(seed.churchBId),
      cycleId: CycleId.from(cycle.id),
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
      state: 'sent',
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Sunday Service',
      start: EVENT_START,
      end: EVENT_END,
    });
    const shiftId = await seedShift({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      eventTimeBlockId: graph.eventTimeBlock.id,
      startTime: EVENT_START,
      endTime: EVENT_END,
    });
    const { shiftRequirementId } = await seedRoleRequirement({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      participationId: graph.participation.id,
      shiftId,
    });

    // Active ministry member with no `ministry_membership_role` row for
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
      cycleId: CycleId.from(cycle.id),
      ministryId: MinistryId.from(seed.ministryAId),
      userId: UserId.from(seed.adminUserId),
    });

    const shiftView = view.events
      .flatMap((eventView) => eventView.eventTimeBlocks)
      .flatMap((eventTimeBlock) => eventTimeBlock.shifts)
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
      shiftRequirementId: ShiftRequirementId.from(shiftRequirementId),
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

describe('DbAssignmentManager.createParticipationAssignment membership race (issue #61)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('does not commit an assignment after the transfer sweep has passed the membership', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'Membership Lock Cycle',
      startDate: CYCLE_START,
      endDate: CYCLE_END,
      state: 'sent',
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Membership Lock Service',
      start: EVENT_START,
      end: EVENT_END,
    });
    const shiftId = await seedShift({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      eventTimeBlockId: graph.eventTimeBlock.id,
      startTime: EVENT_START,
      endTime: EVENT_END,
    });
    const { roleId, shiftRequirementId } = await seedRoleRequirement({
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
    const [membership] = await schedulingTestDb
      .select({ id: ministryMembershipTable.id })
      .from(ministryMembershipTable)
      .where(
        and(
          eq(ministryMembershipTable.churchId, seed.churchAId),
          eq(ministryMembershipTable.ministryId, seed.ministryAId),
          eq(ministryMembershipTable.volunteerId, seed.adminVolunteerId),
        ),
      );
    if (!membership) {
      throw new Error('Active ministry membership was not seeded');
    }

    let releaseSweep: (() => void) | undefined;
    const sweepPaused = new Promise<void>((resolve) => {
      releaseSweep = resolve;
    });
    let signalUpdateIssued: () => void;
    const updateIssued = new Promise<void>((resolve) => {
      signalUpdateIssued = resolve;
    });
    let signalSweepBackendPid: (backendPid: number) => void;
    const sweepBackendPid = new Promise<number>((resolve) => {
      signalSweepBackendPid = resolve;
    });
    const sweepPromise = (schedulingTestDb as AnyDrizzleDb).transaction(
      async (tx) => {
        const result = await tx.execute(
          sql`SELECT pg_backend_pid() AS "backendPid"`,
        );
        signalSweepBackendPid(readBackendPid(result));
        await tx
          .update(ministryMembershipTable)
          .set({ status: 'inactive' })
          .where(eq(ministryMembershipTable.id, membership.id));
        signalUpdateIssued();
        await sweepPaused;
      },
    );

    await updateIssued;
    let signalAssignBackendPid: (backendPid: number) => void = () => {
      throw new Error('Assign backend observer was not initialized');
    };
    const assignBackendPid = new Promise<number>((resolve) => {
      signalAssignBackendPid = resolve;
    });
    const assignmentManager = createAssignmentManager({
      volunteerRepository: new AssignTrackingVolunteerRepository(
        signalAssignBackendPid,
      ),
    });
    const assignPromise = assignmentManager
      .createParticipationAssignment({
        churchId: ChurchId.from(seed.churchAId),
        shiftId: ShiftId.from(shiftId),
        volunteerId: VolunteerId.from(seed.adminVolunteerId),
        shiftRequirementId: ShiftRequirementId.from(shiftRequirementId),
        actorId: UserId.from(seed.adminUserId),
      })
      .then(
        (result) => ({ ok: true as const, result }),
        (error: unknown) => ({ ok: false as const, error }),
      );

    const [sweepPid, assignPid] = await Promise.all([
      sweepBackendPid,
      assignBackendPid,
    ]);
    let lockWaitError: unknown;
    try {
      await waitForAssignMembershipLock({
        assignBackendPid: assignPid,
        sweepBackendPid: sweepPid,
      });
    } catch (error) {
      lockWaitError = error;
    }
    if (!releaseSweep) {
      throw new Error('Transfer sweep pause was not initialized');
    }
    releaseSweep();
    await sweepPromise;
    const assignOutcome = await assignPromise;

    if (lockWaitError) {
      throw lockWaitError;
    }
    expect(assignOutcome.ok).toBe(false);
    if (assignOutcome.ok) {
      return;
    }
    expect(assignOutcome.error).toBeInstanceOf(HardConstraintError);
    expect((assignOutcome.error as HardConstraintError).reason).toBe(
      'NOT_IN_MINISTRY',
    );
    const assignments = await schedulingTestDb
      .select({ id: assignmentTable.id })
      .from(assignmentTable)
      .where(eq(assignmentTable.volunteerId, seed.adminVolunteerId));
    expect(assignments).toHaveLength(0);
  });
});

interface SeedPublishableInput {
  churchId: string;
  ministryId: string;
  cycleName: string;
}

async function seedAssignCycleBelowFull(input: SeedPublishableInput) {
  const cycle = await createSchedulingPhase3Cycle({
    churchId: input.churchId,
    name: input.cycleName,
    startDate: CYCLE_START,
    endDate: CYCLE_END,
    state: 'sent',
  });
  const graph = await createSchedulingPhase3EventGraph({
    churchId: input.churchId,
    cycleId: cycle.id,
    ministryId: input.ministryId,
    title: 'Publishable Service',
    start: EVENT_START,
    end: EVENT_END,
  });
  const shiftId = await seedShift({
    churchId: input.churchId,
    participationId: graph.participation.id,
    eventTimeBlockId: graph.eventTimeBlock.id,
    startTime: EVENT_START,
    endTime: EVENT_END,
  });
  // peopleNeeded 2, zero assignments -> below full.
  await seedRoleRequirement({
    churchId: input.churchId,
    ministryId: input.ministryId,
    participationId: graph.participation.id,
    shiftId,
  });
  // Move the participation into a publishable state.
  await schedulingTestDb
    .update(ministryParticipation)
    .set({ state: 'assigning' })
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
    const { cycle, participationId } = await seedAssignCycleBelowFull({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      cycleName: 'Below Full Cycle',
    });

    const manager = createParticipationManager();
    const result = await manager.publishCycle({
      churchId: ChurchId.from(seed.churchAId),
      cycleId: CycleId.from(cycle.id),
      ministryId: MinistryId.from(seed.ministryAId),
      userId: UserId.from(seed.adminUserId),
    });

    expect(result.published).toBe(false);
    expect(result.belowFull).toBe(true);
    expect(await readParticipationState(participationId)).toBe('assigning');
  });

  it('below-full with confirmation publishes every participation atomically', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { cycle, participationId } = await seedAssignCycleBelowFull({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      cycleName: 'Confirmed Cycle',
    });

    const manager = createParticipationManager();
    const result = await manager.publishCycle({
      churchId: ChurchId.from(seed.churchAId),
      cycleId: CycleId.from(cycle.id),
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
    const { cycle, participationId } = await seedAssignCycleBelowFull({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      cycleName: 'Isolated Publish Cycle',
    });

    const manager = createParticipationManager();
    const result = await manager.publishCycle({
      churchId: ChurchId.from(seed.churchBId),
      cycleId: CycleId.from(cycle.id),
      ministryId: MinistryId.from(seed.ministryBId),
      userId: UserId.from(seed.adminUserId),
      confirmBelowFull: true,
    });

    expect(result.participations).toEqual([]);
    expect(await readParticipationState(participationId)).toBe('assigning');
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
      state: 'sent',
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Audited Service',
      start: EVENT_START,
      end: EVENT_END,
    });
    const shiftId = await seedShift({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      eventTimeBlockId: graph.eventTimeBlock.id,
      startTime: EVENT_START,
      endTime: EVENT_END,
    });
    const { roleId, shiftRequirementId } = await seedRoleRequirement({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      participationId: graph.participation.id,
      shiftId,
    });
    const unrelatedParticipation = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Unrelated service',
      start: new Date('2026-08-08T10:00:00.000Z'),
      end: new Date('2026-08-08T12:00:00.000Z'),
    });
    await expect(
      buildAssignment({
        db: schedulingTestDb,
        churchId: seed.churchAId,
        participationId: unrelatedParticipation.participation.id,
        shiftId,
        shiftRequirementId,
        volunteerId: seed.adminVolunteerId,
        roleId,
        status: 'confirmed',
      }),
    ).rejects.toThrow('No matching ShiftRequirement');
    const createdAt = parseInstant({ value: '2026-08-01T10:00:00.000Z' });
    const assigned = await buildAssignment({
      db: schedulingTestDb,
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId,
      volunteerId: seed.adminVolunteerId,
      roleId,
      shiftRequirementId,
      status: 'confirmed',
      assignedAt: createdAt,
      assignedBy: seed.adminUserId,
    });
    const assignmentId = assigned.id;
    await buildAssignmentAudit({
      db: schedulingTestDb,
      churchId: seed.churchAId,
      assignmentId,
      actorId: seed.adminUserId,
      action: 'created',
      occurredAt: createdAt,
    });

    const repo = new DrizzleAssignmentAuditRepository({ db: schedulingTestDb });
    const items = await repo.listByCycle({
      churchId: ChurchId.from(seed.churchAId),
      cycleId: CycleId.from(cycle.id),
      ministryId: MinistryId.from(seed.ministryAId),
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.assignmentId).toBe(assignmentId);

    const churchBItems = await repo.listByCycle({
      churchId: ChurchId.from(seed.churchBId),
      cycleId: CycleId.from(cycle.id),
      ministryId: MinistryId.from(seed.ministryBId),
    });
    expect(churchBItems).toEqual([]);
  });
});
