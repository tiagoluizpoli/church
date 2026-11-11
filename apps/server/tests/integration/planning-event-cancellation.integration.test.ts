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
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChurchNotifications } from '@/application/church-notifications';
import { ChurchRecipients } from '@/application/church-recipients';
import { DbPlanningEventManager } from '@/application/db-planning-event-manager';
import {
  AssignmentId,
  ChurchId,
  EventTimeBlockId,
  UserId,
} from '@/domain/branded-ids';
import { AdminCancellationWindowClosedError } from '@/domain/errors/admin-cancellation-window-closed';
import { IllegalStateTransitionError } from '@/domain/errors/illegal-state-transition';
import { DrizzleAssignmentRepository } from '@/infrastructure/repositories/drizzle-assignment.repository';
import { DrizzleAssignmentAuditRepository } from '@/infrastructure/repositories/drizzle-assignment-audit.repository';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleCycleRepository } from '@/infrastructure/repositories/drizzle-cycle.repository';
import { DrizzleEventTemplateRepository } from '@/infrastructure/repositories/drizzle-event-template.repository';
import { DrizzleEventTimeBlockRepository } from '@/infrastructure/repositories/drizzle-event-time-block.repository';
import { DrizzleOutboxRepository } from '@/infrastructure/repositories/drizzle-outbox.repository';
import { DrizzlePlanningEventRepository } from '@/infrastructure/repositories/drizzle-planning-event.repository';
import { DrizzleSwapRequestRepository } from '@/infrastructure/repositories/drizzle-swap-request.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { DrizzleVolunteerRepository } from '@/infrastructure/repositories/drizzle-volunteer.repository';
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
const manager = new DbPlanningEventManager({
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
});

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
