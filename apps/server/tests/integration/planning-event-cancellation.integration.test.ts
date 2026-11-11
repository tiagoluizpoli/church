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
import {
  parseCalendarDay,
  parseInstant,
  parseTimeOfDay,
  resetClock,
  setTestClock,
  toInstant,
} from '@church/time';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChurchNotifications } from '@/application/church-notifications';
import { ChurchRecipients } from '@/application/church-recipients';
import { DbPlanningEventManager } from '@/application/db-planning-event-manager';
import {
  AssignmentId,
  ChurchId,
  CycleId,
  EventId,
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
import { buildUser } from '@/seeds/builders/identity';
import {
  buildMinistry,
  buildRole,
  buildSector,
} from '@/seeds/builders/ministry';
import {
  buildAssignment,
  buildCycle,
  buildEvent,
  buildEventTimeBlock,
  buildMinistryParticipation,
  buildShift,
  buildShiftRequirement,
} from '@/seeds/builders/scheduling';
import {
  buildConfirmedAvailabilityCheck,
  buildUnavailableShift,
} from '@/seeds/builders/unavailable-shift';
import {
  buildMinistryMembership,
  buildVolunteer,
} from '@/seeds/builders/volunteer';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

const db = schedulingTestDb;
const CHURCH_TIME_ZONE = 'America/Sao_Paulo';
const CHURCH_OCTOBER_1_NOON = '2026-10-01T15:00:00.000Z';

/** A Church-local wall clock on Sunday 2026-10-18 in São Paulo. */
const at = (time: string) =>
  toInstant({
    day: parseCalendarDay({ value: '2026-10-18' }),
    time: parseTimeOfDay({ value: time }),
    timeZone: CHURCH_TIME_ZONE,
  });

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

interface SeedVolunteerInput {
  churchId: string;
  ministryId: string;
  name: string;
}

async function seedVolunteer({
  churchId,
  ministryId,
  name,
}: SeedVolunteerInput) {
  const user = await buildUser({
    db,
    id: `user-${name}`,
    name,
    email: `${name}@test.com`,
  });
  const volunteer = await buildVolunteer({ db, churchId, userId: user.id });
  const membership = await buildMinistryMembership({
    db,
    churchId,
    volunteerId: volunteer.id,
    ministryId,
    ministryAccessLevel: 'volunteer',
    roleIds: [],
  });
  return { volunteer, membership, userId: user.id };
}

interface StaffInput {
  churchId: string;
  participationId: string;
  eventTimeBlockId: string;
  roleId: string;
  sectorId: string;
  volunteerId: string;
  start: string;
  end: string;
  status: 'draft' | 'pending' | 'confirmed' | 'declined';
}

/** One Shift on an existing block with one Assignment on it. */
async function staff({
  churchId,
  participationId,
  eventTimeBlockId,
  roleId,
  sectorId,
  volunteerId,
  start,
  end,
  status,
}: StaffInput) {
  const shiftRow = await buildShift({
    db,
    churchId,
    participationId,
    eventTimeBlockId,
    start: at(start),
    end: at(end),
  });
  const requirement = await buildShiftRequirement({
    db,
    churchId,
    participationId,
    shiftId: shiftRow.id,
    roleId,
    sectorId,
    peopleNeeded: 1,
  });
  const booked = await buildAssignment({
    db,
    churchId,
    participationId,
    shiftId: shiftRow.id,
    volunteerId,
    roleId,
    shiftRequirementId: requirement.id,
    status,
  });
  return { shift: shiftRow, assignment: booked };
}

/**
 * A Sent Cycle with Sunday 09:00–12:00 (Welcome 09–10, Service 10–12).
 * Ministry A is published: Ana (Welcome, confirmed, open SwapRequest), Bia
 * (Service, pending) and Dani (Service, declined). Media is unpublished:
 * Caio (Service, confirmed). Edu only marked both Shifts unavailable. Ana's
 * last-told snapshot also holds an unrelated entry.
 */
async function seedSentSunday() {
  const seed = await seedSchedulingPhase3Base();
  const churchId = seed.churchAId;
  const cycle = await buildCycle({
    db,
    churchId,
    name: 'October',
    state: 'sent',
    startDate: parseCalendarDay({ value: '2026-10-12' }),
    endDate: parseCalendarDay({ value: '2026-10-25' }),
  });
  const sunday = await buildEvent({
    db,
    churchId,
    cycleId: cycle.id,
    title: 'Sunday',
    start: at('09:00'),
    end: at('12:00'),
    status: 'scheduled',
  });
  const welcome = await buildEventTimeBlock({
    db,
    churchId,
    eventId: sunday.id,
    start: at('09:00'),
    end: at('10:00'),
    label: 'Welcome',
  });
  const service = await buildEventTimeBlock({
    db,
    churchId,
    eventId: sunday.id,
    start: at('10:00'),
    end: at('12:00'),
    label: 'Service',
  });
  const media = await buildMinistry({ db, churchId, name: 'Zeta Media' });
  const published = await buildMinistryParticipation({
    db,
    churchId,
    ministryId: seed.ministryAId,
    eventId: sunday.id,
    state: 'published',
    eventTimeBlockIds: [welcome.id, service.id],
  });
  const unpublished = await buildMinistryParticipation({
    db,
    churchId,
    ministryId: media.id,
    eventId: sunday.id,
    state: 'assigning',
    eventTimeBlockIds: [service.id],
  });
  const usher = await buildRole({
    db,
    churchId,
    ministryId: seed.ministryAId,
    name: 'Usher',
  });
  const camera = await buildRole({
    db,
    churchId,
    ministryId: media.id,
    name: 'Camera',
  });
  const lobby = await buildSector({
    db,
    churchId,
    ministryId: seed.ministryAId,
    name: 'Lobby',
  });
  const booth = await buildSector({
    db,
    churchId,
    ministryId: media.id,
    name: 'Booth',
  });
  const ana = await seedVolunteer({
    churchId,
    ministryId: seed.ministryAId,
    name: 'ana',
  });
  const bia = await seedVolunteer({
    churchId,
    ministryId: seed.ministryAId,
    name: 'bia',
  });
  const dani = await seedVolunteer({
    churchId,
    ministryId: seed.ministryAId,
    name: 'dani',
  });
  const caio = await seedVolunteer({
    churchId,
    ministryId: media.id,
    name: 'caio',
  });
  const edu = await seedVolunteer({
    churchId,
    ministryId: seed.ministryAId,
    name: 'edu',
  });
  const ministryA = { participationId: published.id, roleId: usher.id };
  const anaWelcome = await staff({
    churchId,
    ...ministryA,
    sectorId: lobby.id,
    eventTimeBlockId: welcome.id,
    volunteerId: ana.volunteer.id,
    start: '09:00',
    end: '10:00',
    status: 'confirmed',
  });
  const biaService = await staff({
    churchId,
    ...ministryA,
    sectorId: lobby.id,
    eventTimeBlockId: service.id,
    volunteerId: bia.volunteer.id,
    start: '10:00',
    end: '12:00',
    status: 'pending',
  });
  const daniService = await staff({
    churchId,
    ...ministryA,
    sectorId: lobby.id,
    eventTimeBlockId: service.id,
    volunteerId: dani.volunteer.id,
    start: '10:00',
    end: '11:00',
    status: 'declined',
  });
  const caioService = await staff({
    churchId,
    participationId: unpublished.id,
    roleId: camera.id,
    sectorId: booth.id,
    eventTimeBlockId: service.id,
    volunteerId: caio.volunteer.id,
    start: '10:00',
    end: '12:00',
    status: 'confirmed',
  });
  await db.insert(swapRequest).values({
    churchId,
    assignmentId: anaWelcome.assignment.id,
    status: 'open',
    raisedBy: ana.userId,
  });
  const check = await buildConfirmedAvailabilityCheck({
    db,
    churchId,
    cycleId: cycle.id,
    ministryMembershipId: edu.membership.id,
    id: crypto.randomUUID(),
    confirmedAt: parseInstant({ value: CHURCH_OCTOBER_1_NOON }),
  });
  for (const shiftId of [anaWelcome.shift.id, biaService.shift.id]) {
    await buildUnavailableShift({
      db,
      churchId,
      availabilityCheckId: check.id,
      shiftId,
    });
  }
  const toldAt = new Date(CHURCH_OCTOBER_1_NOON);
  const unrelated = { assignmentId: crypto.randomUUID(), eventTitle: 'Other' };
  await db.insert(scheduleLastTold).values([
    {
      churchId,
      ministryId: seed.ministryAId,
      cycleId: cycle.id,
      volunteerId: ana.volunteer.id,
      assignments: [
        { assignmentId: anaWelcome.assignment.id, eventTitle: 'Sunday' },
        unrelated,
      ],
      toldAt,
    },
    {
      churchId,
      ministryId: seed.ministryAId,
      cycleId: cycle.id,
      volunteerId: bia.volunteer.id,
      assignments: [
        { assignmentId: biaService.assignment.id, eventTitle: 'Sunday' },
      ],
      toldAt,
    },
  ]);

  return {
    seed,
    churchId: ChurchId.from(churchId),
    cycleId: CycleId.from(cycle.id),
    eventId: EventId.from(sunday.id),
    welcomeId: EventTimeBlockId.from(welcome.id),
    serviceId: EventTimeBlockId.from(service.id),
    media,
    ana,
    bia,
    caio,
    anaWelcome,
    biaService,
    daniService,
    caioService,
    unrelated,
    toldAt,
  };
}

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
    expect(await db.select().from(outboxMessage)).toEqual([]);

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
