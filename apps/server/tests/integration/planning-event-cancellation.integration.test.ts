import { appConfig } from '@church/app-config';
import {
  assignment,
  assignmentAudit,
  event,
  eventTimeBlock,
  outboxMessage,
  scheduleLastTold,
  swapRequest,
  unavailableShift,
} from '@church/db';
import { parseInstant, resetClock, setTestClock } from '@church/time';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChurchNotifications } from '@/application/church-notifications';
import { ChurchRecipients } from '@/application/church-recipients';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbPlanningEventManager } from '@/application/db-planning-event-manager';
import { DbSwapRequestManager } from '@/application/db-swap-request-manager';
import {
  AssignmentId,
  ChurchId,
  EventTimeBlockId,
  UserId,
} from '@/domain/branded-ids';
import type {
  CloseOpenSwapRequestInput,
  CreateSwapRequestInput,
} from '@/domain/contracts/infrastructure/swap-request.repository';
import { AdminCancellationWindowClosedError } from '@/domain/errors/admin-cancellation-window-closed';
import { IllegalStateTransitionError } from '@/domain/errors/illegal-state-transition';
import { SwapRequestUnpublishedError } from '@/domain/errors/swap-request';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleSchedulingScopeResolver } from '@/infrastructure/auth/drizzle-scheduling-scope-resolver';
import { DrizzleAssignmentRepository } from '@/infrastructure/repositories/drizzle-assignment.repository';
import { DrizzleAssignmentAuditRepository } from '@/infrastructure/repositories/drizzle-assignment-audit.repository';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleCycleRepository } from '@/infrastructure/repositories/drizzle-cycle.repository';
import { DrizzleEventRepository } from '@/infrastructure/repositories/drizzle-event.repository';
import { DrizzleEventTemplateRepository } from '@/infrastructure/repositories/drizzle-event-template.repository';
import { DrizzleEventTimeBlockRepository } from '@/infrastructure/repositories/drizzle-event-time-block.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleMinistryParticipationRepository } from '@/infrastructure/repositories/drizzle-ministry-participation.repository';
import { DrizzleOutboxRepository } from '@/infrastructure/repositories/drizzle-outbox.repository';
import { DrizzlePlanningEventRepository } from '@/infrastructure/repositories/drizzle-planning-event.repository';
import { DrizzleRoleRepository } from '@/infrastructure/repositories/drizzle-role.repository';
import { DrizzleShiftRepository } from '@/infrastructure/repositories/drizzle-shift.repository';
import { DrizzleSwapRequestRepository } from '@/infrastructure/repositories/drizzle-swap-request.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { DrizzleVolunteerRepository } from '@/infrastructure/repositories/drizzle-volunteer.repository';
import { buildChurchMembership } from '@/seeds/builders/church';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
} from '@/tests/scheduling-reshape/setup';
import {
  at,
  CHURCH_OCTOBER_1_NOON,
  seedSentSunday,
} from '@/tests/test-support/cancellation-fixture';

const db = schedulingTestDb;
const eventRepository = new DrizzlePlanningEventRepository({ db });
const churchRepository = new DrizzleChurchRepository({ db });
const unitOfWork = new DrizzleUnitOfWork({ db });
const managerDependencies = {
  cycleRepository: new DrizzleCycleRepository({ db }),
  eventRepository,
  templateRepository: new DrizzleEventTemplateRepository({ db }),
  churchRepository,
  unitOfWork,
  eventTimeBlockRepository: new DrizzleEventTimeBlockRepository({ db }),
  assignmentRepository: new DrizzleAssignmentRepository({ db }),
  auditRepository: new DrizzleAssignmentAuditRepository({ db }),
  swapRequestRepository: new DrizzleSwapRequestRepository({ db }),
  recipients: new ChurchRecipients({
    churchRepository,
    volunteerRepository: new DrizzleVolunteerRepository({ db }),
  }),
  notifications: new ChurchNotifications({
    outboxRepository: new DrizzleOutboxRepository({ db }),
  }),
};
const manager = new DbPlanningEventManager(managerDependencies);

beforeEach(async () => {
  setTestClock({ instant: parseInstant({ value: CHURCH_OCTOBER_1_NOON }) });
  await resetSchedulingPhase3Db();
});

afterEach(() => {
  resetClock();
});

async function lastToldOf(volunteerId: string) {
  const [row] = await db
    .select()
    .from(scheduleLastTold)
    .where(eq(scheduleLastTold.volunteerId, volunteerId));
  return row;
}

async function statusOf(assignmentId: string) {
  const [row] = await db
    .select({ status: assignment.status })
    .from(assignment)
    .where(eq(assignment.id, assignmentId));
  return row?.status;
}

describe('cancellation repository operations', () => {
  it('lists the scope active Assignments with published, open-request and Shift-line facts', async () => {
    const sunday = await seedSentSunday();
    const { churchId, eventId, welcomeId } = sunday;

    const whole = await eventRepository.listCancellationScopeAssignments({
      churchId,
      eventId,
    });
    const block = await eventRepository.listCancellationScopeAssignments({
      churchId,
      eventId,
      eventTimeBlockId: welcomeId,
    });
    const foreign = await eventRepository.listCancellationScopeAssignments({
      churchId: ChurchId.from(sunday.seed.churchBId),
      eventId,
    });

    const brief = whole.map(({ assignmentId, published, openSwapRequest }) => ({
      assignmentId,
      published,
      openSwapRequest,
    }));
    expect(brief).toEqual([
      {
        assignmentId: sunday.anaWelcome.assignment.id,
        published: true,
        openSwapRequest: true,
      },
      ...[sunday.biaService, sunday.caioService]
        .map(({ assignment: { id } }) => id)
        .sort()
        .map((assignmentId) => ({
          assignmentId,
          published: assignmentId === sunday.biaService.assignment.id,
          openSwapRequest: false,
        })),
    ]);
    expect(block).toEqual([
      {
        assignmentId: sunday.anaWelcome.assignment.id,
        eventTimeBlockId: welcomeId,
        shiftId: sunday.anaWelcome.shift.id,
        volunteerId: sunday.ana.volunteer.id,
        userId: sunday.ana.userId,
        ministryId: sunday.seed.ministryAId,
        ministryName: 'Scheduling Ministry A',
        roleName: 'Usher',
        sectorName: 'Lobby',
        shiftStart: at('09:00'),
        shiftEnd: at('10:00'),
        published: true,
        openSwapRequest: true,
      },
    ]);
    expect(foreign).toEqual([]);
  });

  it('deletes only the cancelled blocks UnavailableShifts, inside the Church', async () => {
    const { churchId, welcomeId, seed, biaService } = await seedSentSunday();

    const foreign = await unitOfWork.run((tx) =>
      eventRepository.deleteScopeUnavailableShifts({
        churchId: ChurchId.from(seed.churchBId),
        eventTimeBlockIds: [welcomeId],
        tx,
      }),
    );
    const deleted = await unitOfWork.run((tx) =>
      eventRepository.deleteScopeUnavailableShifts({
        churchId,
        eventTimeBlockIds: [welcomeId],
        tx,
      }),
    );

    expect(foreign).toBe(0);
    expect(deleted).toBe(1);
    const left = await db.select().from(unavailableShift);
    expect(left.map(({ shiftId }) => shiftId)).toEqual([biaService.shift.id]);
  });

  it('drops only the cancelled entries from last-told snapshots and keeps rows and toldAt', async () => {
    const sunday = await seedSentSunday();
    const { churchId, cycleId, ana, bia, unrelated, toldAt } = sunday;
    const cancelled = [
      AssignmentId.from(sunday.anaWelcome.assignment.id),
      AssignmentId.from(sunday.biaService.assignment.id),
    ];

    await unitOfWork.run((tx) =>
      eventRepository.removeLastToldAssignments({
        churchId: ChurchId.from(sunday.seed.churchBId),
        cycleId,
        assignmentIds: cancelled,
        tx,
      }),
    );
    expect((await lastToldOf(bia.volunteer.id))?.assignments).toHaveLength(1);

    await unitOfWork.run((tx) =>
      eventRepository.removeLastToldAssignments({
        churchId,
        cycleId,
        assignmentIds: cancelled,
        tx,
      }),
    );

    expect(await lastToldOf(ana.volunteer.id)).toMatchObject({
      assignments: [unrelated],
      toldAt,
    });
    expect(await lastToldOf(bia.volunteer.id)).toMatchObject({
      assignments: [],
      toldAt,
    });
  });

  it('cancels one EventTimeBlock and leaves its sibling active', async () => {
    const { churchId, welcomeId, serviceId } = await seedSentSunday();

    await unitOfWork.run((tx) =>
      eventRepository.cancelEventTimeBlock({
        churchId,
        eventTimeBlockId: welcomeId,
        tx,
      }),
    );

    const blocks = await db
      .select({ id: eventTimeBlock.id, status: eventTimeBlock.status })
      .from(eventTimeBlock);
    expect(
      Object.fromEntries(blocks.map(({ id, status }) => [id, status])),
    ).toEqual({ [welcomeId]: 'cancelled', [serviceId]: 'active' });
  });
});

describe('DbPlanningEventManager cancellation', () => {
  it('previews the whole Event impact without writing', async () => {
    const sunday = await seedSentSunday();
    const { churchId, cycleId, eventId } = sunday;
    const snapshot = () =>
      Promise.all([
        db.select().from(event),
        db.select().from(eventTimeBlock),
        db.select().from(assignment),
        db.select().from(assignmentAudit),
        db.select().from(swapRequest),
        db.select().from(unavailableShift),
        db.select().from(scheduleLastTold),
        db.select().from(outboxMessage),
      ]);
    const before = await snapshot();

    const impact = await manager.previewCancellation({
      churchId,
      cycleId,
      eventId,
      scope: { kind: 'event' },
    });

    expect(impact).toEqual({
      scope: { kind: 'event' },
      eventId,
      eventTitle: 'Sunday',
      start: at('09:00'),
      end: at('12:00'),
      volunteerCount: 2,
      ministryCount: 1,
      ministries: [
        {
          ministryId: sunday.seed.ministryAId,
          ministryName: 'Scheduling Ministry A',
          volunteerCount: 2,
        },
        {
          ministryId: sunday.media.id,
          ministryName: 'Zeta Media',
          volunteerCount: 0,
        },
      ],
      openSwapRequestCount: 1,
    });
    expect(await snapshot()).toEqual(before);
  });

  it('confirms one block: soft-cancels, audits, covers, unmarks and untells only its scope', async () => {
    const sunday = await seedSentSunday();
    const { churchId, cycleId, eventId, welcomeId, serviceId } = sunday;
    const actingUserId = UserId.from(sunday.seed.adminUserId);
    const anaAssignmentId = sunday.anaWelcome.assignment.id;

    const impact = await manager.confirmCancellation({
      churchId,
      cycleId,
      eventId,
      scope: { kind: 'eventTimeBlock', eventTimeBlockId: welcomeId },
      actingUserId,
    });

    expect(impact).toMatchObject({
      start: at('09:00'),
      end: at('10:00'),
      volunteerCount: 1,
      ministryCount: 1,
      openSwapRequestCount: 1,
    });
    const blocks = await db
      .select({ id: eventTimeBlock.id, status: eventTimeBlock.status })
      .from(eventTimeBlock);
    expect(
      Object.fromEntries(blocks.map(({ id, status }) => [id, status])),
    ).toEqual({ [welcomeId]: 'cancelled', [serviceId]: 'active' });
    const [sundayRow] = await db.select().from(event);
    expect(sundayRow?.status).toBe('scheduled');
    expect(await statusOf(anaAssignmentId)).toBe('cancelled');
    expect(await statusOf(sunday.biaService.assignment.id)).toBe('pending');
    expect(
      await db
        .select({
          actorId: assignmentAudit.actorId,
          action: assignmentAudit.action,
        })
        .from(assignmentAudit)
        .where(eq(assignmentAudit.assignmentId, anaAssignmentId)),
    ).toEqual([{ actorId: actingUserId, action: 'event_cancelled' }]);
    expect(await db.select().from(swapRequest)).toMatchObject([
      { status: 'covered', closedBy: actingUserId },
    ]);
    const marks = await db.select().from(unavailableShift);
    expect(marks.map(({ shiftId }) => shiftId)).toEqual([
      sunday.biaService.shift.id,
    ]);
    expect((await lastToldOf(sunday.ana.volunteer.id))?.assignments).toEqual([
      sunday.unrelated,
    ]);
    expect(
      (await lastToldOf(sunday.bia.volunteer.id))?.assignments,
    ).toHaveLength(1);
    // Only N9 (Ana) and N10 (the leader): the covered close sends no N8.
    const kinds = (await db.select().from(outboxMessage)).map(
      ({ payload }) => (payload as { kind: string }).kind,
    );
    expect(kinds.sort()).toEqual(['event_cancelled', 'event_changed']);

    await expect(
      manager.confirmCancellation({
        churchId,
        cycleId,
        eventId,
        scope: { kind: 'eventTimeBlock', eventTimeBlockId: welcomeId },
        actingUserId,
      }),
    ).rejects.toBeInstanceOf(IllegalStateTransitionError);
  });

  it('confirms the whole Event: every active Assignment, published or not, and nothing twice', async () => {
    const sunday = await seedSentSunday();
    const { churchId, cycleId, eventId } = sunday;
    const input = {
      churchId,
      cycleId,
      eventId,
      scope: { kind: 'event' as const },
      actingUserId: UserId.from(sunday.seed.adminUserId),
    };

    const results = await Promise.allSettled([
      manager.confirmCancellation(input),
      manager.confirmCancellation(input),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    const [sundayRow] = await db.select().from(event);
    expect(sundayRow?.status).toBe('cancelled');
    expect(await statusOf(sunday.anaWelcome.assignment.id)).toBe('cancelled');
    expect(await statusOf(sunday.biaService.assignment.id)).toBe('cancelled');
    expect(await statusOf(sunday.caioService.assignment.id)).toBe('cancelled');
    expect(await statusOf(sunday.daniService.assignment.id)).toBe('declined');
    expect(await db.select().from(assignmentAudit)).toHaveLength(3);
    expect(await db.select().from(unavailableShift)).toEqual([]);
    expect((await lastToldOf(sunday.bia.volunteer.id))?.assignments).toEqual(
      [],
    );
  });

  it('refuses a started scope, a foreign block and a non-Sent Cycle', async () => {
    const sunday = await seedSentSunday();
    const { churchId, cycleId, eventId, welcomeId, serviceId } = sunday;
    const preview = (
      scope: Parameters<typeof manager.previewCancellation>[0]['scope'],
    ) => manager.previewCancellation({ churchId, cycleId, eventId, scope });

    setTestClock({ instant: at('09:30') });
    await expect(preview({ kind: 'event' })).rejects.toBeInstanceOf(
      AdminCancellationWindowClosedError,
    );
    await expect(
      preview({ kind: 'eventTimeBlock', eventTimeBlockId: welcomeId }),
    ).rejects.toBeInstanceOf(AdminCancellationWindowClosedError);
    await expect(
      preview({ kind: 'eventTimeBlock', eventTimeBlockId: serviceId }),
    ).resolves.toMatchObject({ start: at('10:00') });
    await expect(
      preview({
        kind: 'eventTimeBlock',
        eventTimeBlockId: EventTimeBlockId.from(crypto.randomUUID()),
      }),
    ).rejects.toMatchObject({ name: 'NotFoundError' });

    await db.update(event).set({ status: 'draft' });
    await expect(preview({ kind: 'event' })).rejects.toBeInstanceOf(
      IllegalStateTransitionError,
    );
  });
});

/** A promise the test resolves to let a paused transaction go on. */
function gate() {
  let open = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

/** Waits until some backend of this database waits on a row lock. */
async function waitForLockWait() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const { rows } = await db.execute<{ waiting: number }>(
      sql`select count(*)::int as waiting from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'`,
    );
    if ((rows[0]?.waiting ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('No transaction ever waited on the Assignment row lock');
}

/** Bia's own SwapRequest raise, with every real repository. */
function swapRequestManager(swapRequestRepo: DrizzleSwapRequestRepository) {
  const plainEventRepo = new DrizzleEventRepository({ db });
  const ministryRepo = new DrizzleMinistryRepository({ db });
  return new DbSwapRequestManager({
    swapRequestRepo,
    assignmentRepo: new DrizzleAssignmentRepository({ db }),
    participationRepo: new DrizzleMinistryParticipationRepository({ db }),
    shiftRepo: new DrizzleShiftRepository({ db }),
    eventRepo: plainEventRepo,
    ministryRepo,
    roleRepo: new DrizzleRoleRepository({ db }),
    churchRepo: churchRepository,
    volunteerRepo: new DrizzleVolunteerRepository({ db }),
    recipients: new ChurchRecipients({
      churchRepository,
      volunteerRepository: new DrizzleVolunteerRepository({ db }),
    }),
    notifications: new ChurchNotifications({
      outboxRepository: new DrizzleOutboxRepository({ db }),
    }),
    authorityManager: new DbAuthorityManager({
      actorRepository: new DrizzleAuthorityActorResolver({ db }),
      scopeRepository: new DrizzleSchedulingScopeResolver({ db }),
      eventRepository: plainEventRepo,
      eventTimeBlockRepository: new DrizzleEventTimeBlockRepository({ db }),
      ministryRepository: ministryRepo,
    }),
    unitOfWork,
    config: appConfig,
  });
}

/**
 * The raise locks the Assignment row (FOR UPDATE) from its published check to
 * its insert, and confirm's status update needs that row: whichever goes
 * first, no open SwapRequest is stored on a cancelled Assignment.
 */
describe('a SwapRequest raised while confirm runs', () => {
  async function seedRace() {
    const sunday = await seedSentSunday();
    await buildChurchMembership({
      db,
      churchId: sunday.churchId,
      userId: sunday.bia.userId,
      accessLevel: 'member',
    });
    const raise = {
      churchId: sunday.churchId,
      userId: UserId.from(sunday.bia.userId),
      assignmentId: AssignmentId.from(sunday.biaService.assignment.id),
    };
    const confirm = {
      churchId: sunday.churchId,
      cycleId: sunday.cycleId,
      eventId: sunday.eventId,
      scope: { kind: 'event' } as const,
      actingUserId: UserId.from(sunday.seed.adminUserId),
    };
    return { sunday, raise, confirm };
  }

  async function biaRequests(assignmentId: string) {
    return db
      .select({ status: swapRequest.status })
      .from(swapRequest)
      .where(eq(swapRequest.assignmentId, assignmentId));
  }

  it('closes as covered a request raised first and committed while confirm waits', async () => {
    const { sunday, raise, confirm } = await seedRace();
    const paused = gate();
    const reached = gate();
    // Pauses the raise after its Assignment lock and published check.
    class PausedCreate extends DrizzleSwapRequestRepository {
      override async create(input: CreateSwapRequestInput) {
        reached.open();
        await paused.opened;
        return super.create(input);
      }
    }
    const raising = swapRequestManager(new PausedCreate({ db })).raise(raise);
    await reached.opened;

    const confirming = manager.confirmCancellation(confirm);
    await waitForLockWait();
    paused.open();

    await expect(raising).resolves.toMatchObject({ status: 'open' });
    // Ana's seeded request and the one raised while confirm waited.
    await expect(confirming).resolves.toMatchObject({
      volunteerCount: 2,
      openSwapRequestCount: 2,
    });
    const { id } = sunday.biaService.assignment;
    expect(await statusOf(id)).toBe('cancelled');
    expect(await biaRequests(id)).toEqual([{ status: 'covered' }]);
  });

  it('refuses a raise that reaches the Assignment after confirm cancelled it', async () => {
    const { sunday, raise, confirm } = await seedRace();
    const paused = gate();
    const reached = gate();
    // Pauses confirm after Bia's status update, holding her row.
    class PausedClose extends DrizzleSwapRequestRepository {
      override async closeOpenByAssignment(input: CloseOpenSwapRequestInput) {
        if (input.assignmentId === sunday.biaService.assignment.id) {
          reached.open();
          await paused.opened;
        }
        return super.closeOpenByAssignment(input);
      }
    }
    const pausedManager = new DbPlanningEventManager({
      ...managerDependencies,
      swapRequestRepository: new PausedClose({ db }),
    });
    const confirming = pausedManager.confirmCancellation(confirm);
    await reached.opened;

    const raising = swapRequestManager(
      new DrizzleSwapRequestRepository({ db }),
    ).raise(raise);
    await waitForLockWait();
    paused.open();

    await expect(confirming).resolves.toMatchObject({ volunteerCount: 2 });
    await expect(raising).rejects.toBeInstanceOf(SwapRequestUnpublishedError);
    const { id } = sunday.biaService.assignment;
    expect(await statusOf(id)).toBe('cancelled');
    expect(await biaRequests(id)).toEqual([]);
  });
});
