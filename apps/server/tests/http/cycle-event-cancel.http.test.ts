import {
  assignment,
  assignmentAudit,
  cycle,
  event,
  eventTimeBlock,
  outboxMessage,
  scheduleLastTold,
  swapRequest,
  unavailableShift,
} from '@church/db';
import { m } from '@church/i18n/messages';
import {
  parseCalendarDay,
  parseInstant,
  resetClock,
  setTestClock,
} from '@church/time';
import { eq } from 'drizzle-orm';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AuthorityGuard } from '@/api/auth/authority-guard';
import { ChurchAdminController } from '@/api/controllers/church-admin-controller';
import { ChurchNotifications } from '@/application/church-notifications';
import { ChurchRecipients } from '@/application/church-recipients';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbPlanningEventManager } from '@/application/db-planning-event-manager';
import {
  ChurchId,
  MinistryId,
  UserId,
  VolunteerId,
} from '@/domain/branded-ids';
import type { EnqueueNotificationInput } from '@/domain/contracts/application/church-notifications';
import type { NotificationRequestKind } from '@/domain/notification-kinds';
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
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import {
  buildCycle,
  buildEvent,
  buildEventTimeBlock,
} from '@/seeds/builders/scheduling';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
} from '@/tests/scheduling-reshape/setup';
import {
  at,
  CHURCH_OCTOBER_1_NOON,
  seedSentSunday,
  seedVolunteer,
  staff,
} from '@/tests/test-support/cancellation-fixture';
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockGetSession = vi.mocked(
  (await import('@/main/di/server-auth')).auth.api.getSession,
);

const activeChurchResolver = { resolve: vi.fn() };
const actorRepository = { resolveActor: vi.fn() };
const db = schedulingTestDb;

/** The outbox, failing every enqueue of one kind while armed. */
class FlakyNotifications extends ChurchNotifications {
  failKind: NotificationRequestKind | null = null;

  override async enqueue<K extends NotificationRequestKind>(
    input: EnqueueNotificationInput<K>,
  ): Promise<void> {
    if (input.kind === this.failKind) throw new Error('injected outbox fault');
    return super.enqueue(input);
  }
}

const notifications = new FlakyNotifications({
  outboxRepository: new DrizzleOutboxRepository({ db }),
});

let app: FastifyTypedInstance;

beforeAll(async () => {
  const churchRepository = new DrizzleChurchRepository({ db });
  app = await createFastify({ locale: testLocale });
  const controller = new ChurchAdminController({
    cycleManager: {} as never,
    planningEventManager: new DbPlanningEventManager({
      cycleRepository: new DrizzleCycleRepository({ db }),
      eventRepository: new DrizzlePlanningEventRepository({ db }),
      templateRepository: new DrizzleEventTemplateRepository({ db }),
      churchRepository,
      unitOfWork: new DrizzleUnitOfWork({ db }),
      eventTimeBlockRepository: new DrizzleEventTimeBlockRepository({ db }),
      assignmentRepository: new DrizzleAssignmentRepository({ db }),
      auditRepository: new DrizzleAssignmentAuditRepository({ db }),
      swapRequestRepository: new DrizzleSwapRequestRepository({ db }),
      recipients: new ChurchRecipients({
        churchRepository,
        volunteerRepository: new DrizzleVolunteerRepository({ db }),
      }),
      notifications,
    }),
    eventTemplateManager: {} as never,
    activeChurchResolver: activeChurchResolver as never,
    ministryManager: {} as never,
    setupProgressManager: {} as never,
    authorityGuard: new AuthorityGuard({
      manager: new DbAuthorityManager({
        actorRepository: actorRepository as never,
        scopeRepository: {} as never,
        eventRepository: {} as never,
        eventTimeBlockRepository: {} as never,
        ministryRepository: {} as never,
      }),
    }),
  });
  await app.register(
    async (instance) => {
      instance.register(controller.registerRoutes.bind(controller), {
        prefix: controller.prefix,
      });
    },
    { prefix: '/api/v1' },
  );
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  vi.resetAllMocks();
  notifications.failKind = null;
  setTestClock({ instant: parseInstant({ value: CHURCH_OCTOBER_1_NOON }) });
  await resetSchedulingPhase3Db();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetClock();
});

type Persona = 'admin' | 'member' | 'leader' | 'anonymous';

type Sunday = Awaited<ReturnType<typeof seedSentSunday>>;

interface SignInInput {
  sunday: Sunday;
  persona?: Persona;
}

/** The Church A admin (who also leads Ministry A), or a lesser persona. */
function signIn({ sunday: { seed }, persona = 'admin' }: SignInInput) {
  if (persona === 'anonymous') {
    mockGetSession.mockResolvedValue(null as never);
    return;
  }
  const churchId = ChurchId.from(seed.churchAId);
  const isLeader = persona === 'leader';
  mockGetSession.mockResolvedValue({
    user: { id: seed.adminUserId },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: seed.churchAId,
    volunteerId: null,
    autoSelected: false,
  });
  actorRepository.resolveActor.mockResolvedValue({
    userId: UserId.from(seed.adminUserId),
    activeChurchId: churchId,
    volunteerId: isLeader ? VolunteerId.from(seed.adminVolunteerId) : null,
    churchMembership: {
      churchId,
      accessLevel: persona === 'admin' ? 'admin' : 'member',
    },
    ministryMemberships: isLeader
      ? [
          {
            churchId,
            ministryId: MinistryId.from(seed.ministryAId),
            accessLevel: 'leader',
            qualifiedRoleIds: [],
          },
        ]
      : [],
  });
}

interface CancelInput {
  cycleId: string;
  eventId: string;
  locale?: 'en' | 'pt-BR';
}

function preview({ cycleId, eventId, locale = 'en' }: CancelInput) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/admin/cycles/${cycleId}/events/${eventId}/cancel/preview`,
    cookies: { [testLocale.localeCookieName]: locale },
  });
}

interface ConfirmInput extends CancelInput {
  payload?: unknown;
}

function confirm({
  cycleId,
  eventId,
  locale = 'en',
  payload = { confirmation: 'cancel' },
}: ConfirmInput) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/admin/cycles/${cycleId}/events/${eventId}/cancel`,
    payload: payload as never,
    cookies: { [testLocale.localeCookieName]: locale },
  });
}

/** Every table a refused or previewed cancellation must leave untouched. */
async function writeSnapshot() {
  const [events, blocks, assignments, audits, swaps, marks, told, outbox] =
    await Promise.all([
      db.select().from(event),
      db.select().from(eventTimeBlock),
      db.select().from(assignment),
      db.select().from(assignmentAudit),
      db.select().from(swapRequest),
      db.select().from(unavailableShift),
      db.select().from(scheduleLastTold),
      db.select().from(outboxMessage),
    ]);
  return { events, blocks, assignments, audits, swaps, marks, told, outbox };
}

interface OutboxPayload {
  kind: string;
  to: { userId: string };
  data: Record<string, unknown>;
}

async function outboxPayloads(): Promise<OutboxPayload[]> {
  const rows = await db.select().from(outboxMessage);
  return rows.map(({ payload }) => payload as OutboxPayload);
}

async function statusOf(assignmentId: string) {
  const [row] = await db
    .select({ status: assignment.status })
    .from(assignment)
    .where(eq(assignment.id, assignmentId));
  return row?.status;
}

/** Another ChurchAdmin: the leaderless Media fallback (never the actor). */
async function seedOtherAdmin({ sunday }: { sunday: Sunday }) {
  await buildUser({ db, id: 'other-admin', name: 'Olga', email: 'o@t.com' });
  await buildChurchMembership({
    db,
    churchId: sunday.churchId,
    userId: 'other-admin',
    accessLevel: 'admin',
  });
}

describe('POST /admin/cycles/:cycleId/events/:eventId/cancel/preview', () => {
  it('reports the published-told impact per participating Ministry and writes nothing', async () => {
    const sunday = await seedSentSunday();
    signIn({ sunday });
    const before = await writeSnapshot();

    const response = await preview(sunday);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      scope: { kind: 'event' },
      eventId: sunday.eventId,
      eventTitle: 'Sunday',
      start: at('09:00'),
      end: at('12:00'),
      // Ana and Bia are published; Dani declined, Caio is unpublished.
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
    expect(await writeSnapshot()).toEqual(before);
  });
});

describe('POST /admin/cycles/:cycleId/events/:eventId/cancel', () => {
  it('cancels the Event in one transaction and enqueues one N9 per published Volunteer and deduped N10', async () => {
    const sunday = await seedSentSunday();
    signIn({ sunday });
    await seedOtherAdmin({ sunday });
    const actingUserId = sunday.seed.adminUserId;

    const response = await confirm({
      ...sunday,
      payload: { confirmation: '  CANCEL ' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      scope: { kind: 'event' },
      volunteerCount: 2,
      ministryCount: 1,
      openSwapRequestCount: 1,
    });
    const [sundayRow] = await db.select().from(event);
    expect(sundayRow?.status).toBe('cancelled');
    // Soft-cancelled and retained; the declined one is not active work.
    const { anaWelcome, biaService, caioService, daniService } = sunday;
    expect(await statusOf(anaWelcome.assignment.id)).toBe('cancelled');
    expect(await statusOf(biaService.assignment.id)).toBe('cancelled');
    expect(await statusOf(caioService.assignment.id)).toBe('cancelled');
    expect(await statusOf(daniService.assignment.id)).toBe('declined');
    const audits = await db
      .select({
        assignmentId: assignmentAudit.assignmentId,
        actorId: assignmentAudit.actorId,
        action: assignmentAudit.action,
      })
      .from(assignmentAudit);
    expect(audits).toHaveLength(3);
    for (const audit of audits) {
      expect(audit).toMatchObject({
        actorId: actingUserId,
        action: 'event_cancelled',
      });
    }
    expect(await db.select().from(swapRequest)).toMatchObject([
      { status: 'covered', closedBy: actingUserId },
    ]);
    expect(await db.select().from(unavailableShift)).toEqual([]);
    const told = await db.select().from(scheduleLastTold);
    expect(
      told.find(({ volunteerId }) => volunteerId === sunday.ana.volunteer.id)
        ?.assignments,
    ).toEqual([sunday.unrelated]);
    expect(
      told.find(({ volunteerId }) => volunteerId === sunday.bia.volunteer.id)
        ?.assignments,
    ).toEqual([]);

    const payloads = await outboxPayloads();
    // No N8 for the covered close and no N6: N9 and N10 only.
    expect(payloads.map(({ kind }) => kind).sort()).toEqual([
      'event_cancelled',
      'event_cancelled',
      'event_changed',
      'event_changed',
    ]);
    const n9 = payloads.filter(({ kind }) => kind === 'event_cancelled');
    expect(n9.map(({ to }) => to.userId).sort()).toEqual(
      [sunday.ana.userId, sunday.bia.userId].sort(),
    );
    expect(n9.find(({ to }) => to.userId === sunday.ana.userId)?.data).toEqual({
      cycleId: sunday.cycleId,
      eventId: sunday.eventId,
      eventTitle: 'Sunday',
      start: at('09:00'),
      churchName: 'Scheduling Church A',
      churchTimezone: 'America/Sao_Paulo',
      shifts: [
        {
          eventTitle: 'Sunday',
          roleName: 'Usher',
          sectorName: 'Lobby',
          startsAt: at('09:00'),
          endsAt: at('10:00'),
        },
      ],
    });
    const n10 = Object.fromEntries(
      payloads
        .filter(({ kind }) => kind === 'event_changed')
        .map(({ to, data }) => [to.userId, data]),
    );
    const bounds = { kind: 'cancel', start: at('09:00'), end: at('12:00') };
    // The acting admin keeps their leader line; the other admin covers Media.
    expect(n10[actingUserId]).toMatchObject({
      adminName: 'Scheduling Admin',
      ministries: [
        { id: sunday.seed.ministryAId, name: 'Scheduling Ministry A' },
      ],
      change: {
        ...bounds,
        impacts: [
          {
            ministryId: sunday.seed.ministryAId,
            ministryName: 'Scheduling Ministry A',
            volunteerCount: 2,
          },
        ],
      },
    });
    expect(n10['other-admin']).toMatchObject({
      ministries: [{ id: sunday.media.id, name: 'Zeta Media' }],
      change: {
        ...bounds,
        impacts: [
          {
            ministryId: sunday.media.id,
            ministryName: 'Zeta Media',
            volunteerCount: 0,
          },
        ],
      },
    });
  });

  it('recalculates over a stale preview: a Volunteer published after it is told too', async () => {
    const sunday = await seedSentSunday();
    signIn({ sunday });
    const previewed = await preview(sunday);
    expect(previewed.json().volunteerCount).toBe(2);
    const fia = await seedVolunteer({
      churchId: sunday.churchId,
      ministryId: sunday.seed.ministryAId,
      name: 'fia',
    });
    await staff({
      churchId: sunday.churchId,
      ...sunday.ministryA,
      sectorId: sunday.lobbyId,
      eventTimeBlockId: sunday.welcomeId,
      volunteerId: fia.volunteer.id,
      start: '09:00',
      end: '10:00',
      status: 'confirmed',
    });

    const response = await confirm(sunday);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      volunteerCount: 3,
      ministries: [expect.objectContaining({ volunteerCount: 3 }), {}],
    });
    const n9 = (await outboxPayloads()).filter(
      ({ kind }) => kind === 'event_cancelled',
    );
    expect(n9.map(({ to }) => to.userId)).toContain(fia.userId);
  });

  it('accepts the pt-BR word and still gates a zero-impact Event', async () => {
    const sunday = await seedSentSunday();
    signIn({ sunday });
    await db.delete(assignment);

    const response = await confirm({
      ...sunday,
      locale: 'pt-BR',
      payload: { confirmation: ' Cancelar' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      volunteerCount: 0,
      ministryCount: 0,
      openSwapRequestCount: 0,
    });
    const [sundayRow] = await db.select().from(event);
    expect(sundayRow?.status).toBe('cancelled');
    // Nobody to tell by N9; leaders still hear of it.
    expect(
      (await outboxPayloads()).filter(({ kind }) => kind === 'event_cancelled'),
    ).toEqual([]);
  });

  it.each([
    ['en', 'cancelar'],
    ['en', 'cancel it'],
    ['en', 'canc'],
    ['pt-BR', 'cancel'],
    ['en', ''],
  ] as const)('refuses the %s confirmation %j with a localized CANCEL_CONFIRMATION and writes nothing', async (locale, confirmation) => {
    const sunday = await seedSentSunday();
    signIn({ sunday });
    const before = await writeSnapshot();

    const response = await confirm({
      ...sunday,
      locale,
      payload: { confirmation },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: 'VALIDATION_ERROR',
      reason: 'CANCEL_CONFIRMATION',
      message: m.error_validation_cancel_confirmation({}, { locale }),
    });
    expect(await writeSnapshot()).toEqual(before);
  });

  it('refuses a missing confirmation through shared schema validation', async () => {
    const sunday = await seedSentSunday();
    signIn({ sunday });

    const response = await confirm({ ...sunday, payload: {} });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
    expect(response.json().reason).toBeUndefined();
  });

  it('serializes a racing double confirm into one commit and one outbox set', async () => {
    const sunday = await seedSentSunday();
    signIn({ sunday });

    const results = await Promise.all([confirm(sunday), confirm(sunday)]);

    expect(results.map(({ statusCode }) => statusCode).sort()).toEqual([
      200, 409,
    ]);
    const refused = results.find(({ statusCode }) => statusCode === 409);
    expect(refused?.json()).toMatchObject({
      error: 'ILLEGAL_STATE_TRANSITION',
    });
    expect(await db.select().from(assignmentAudit)).toHaveLength(3);
    const n9 = (await outboxPayloads()).filter(
      ({ kind }) => kind === 'event_cancelled',
    );
    expect(n9).toHaveLength(2);
    // Two N9 and the leader's N10; leaderless Media has no other admin.
    const queued = await outboxPayloads();
    expect(queued).toHaveLength(3);

    const repeated = await confirm(sunday);
    expect(repeated.statusCode).toBe(409);
    expect(await outboxPayloads()).toEqual(queued);
  });

  it('rolls everything back when an outbox write fails after N9 was queued', async () => {
    const sunday = await seedSentSunday();
    signIn({ sunday });
    notifications.failKind = 'event_changed';
    const before = await writeSnapshot();

    const response = await confirm(sunday);

    expect(response.statusCode).toBe(500);
    expect(await writeSnapshot()).toEqual(before);
  });

  it('refuses a started Event with the admin window code and writes nothing', async () => {
    const sunday = await seedSentSunday();
    signIn({ sunday });
    setTestClock({ instant: at('09:00') });
    const before = await writeSnapshot();

    const previewed = await preview({ ...sunday, locale: 'pt-BR' });
    const response = await confirm(sunday);

    expect(previewed.statusCode).toBe(409);
    expect(previewed.json()).toEqual({
      error: 'ADMIN_CANCELLATION_WINDOW_CLOSED',
      message: m.error_admin_cancellation_window_closed(
        {},
        { locale: 'pt-BR' },
      ),
    });
    expect(response.json()).toMatchObject({
      error: 'ADMIN_CANCELLATION_WINDOW_CLOSED',
    });
    expect(await writeSnapshot()).toEqual(before);
  });

  it.each([
    'draft',
    'past',
  ] as const)('refuses a %s Cycle as ILLEGAL_STATE_TRANSITION', async (state) => {
    const sunday = await seedSentSunday();
    signIn({ sunday });
    await db.update(cycle).set({ state }).where(eq(cycle.id, sunday.cycleId));
    const before = await writeSnapshot();

    const response = await confirm(sunday);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'ILLEGAL_STATE_TRANSITION',
    });
    expect(await writeSnapshot()).toEqual(before);
  });

  it('answers 404 to an unknown, foreign or wrong-Cycle Event', async () => {
    const sunday = await seedSentSunday();
    signIn({ sunday });
    const otherCycle = await buildCycle({
      db,
      churchId: sunday.churchId,
      name: 'Other',
      state: 'sent',
      startDate: parseCalendarDay({ value: '2026-10-26' }),
      endDate: parseCalendarDay({ value: '2026-10-31' }),
    });
    const foreignCycle = await buildCycle({
      db,
      churchId: sunday.seed.churchBId,
      name: 'Foreign',
      state: 'sent',
      startDate: parseCalendarDay({ value: '2026-10-12' }),
      endDate: parseCalendarDay({ value: '2026-10-25' }),
    });
    const before = await writeSnapshot();

    for (const target of [
      { cycleId: sunday.cycleId, eventId: crypto.randomUUID() },
      { cycleId: otherCycle.id, eventId: sunday.eventId },
      { cycleId: foreignCycle.id, eventId: sunday.eventId },
    ]) {
      expect((await preview(target)).statusCode).toBe(404);
      expect((await confirm(target)).statusCode).toBe(404);
    }
    expect(await writeSnapshot()).toEqual(before);
  });

  it.each([
    ['anonymous', 401],
    ['member', 403],
    ['leader', 403],
  ] as const)('answers %s with %i on both routes', async (persona, status) => {
    const sunday = await seedSentSunday();
    signIn({ sunday, persona });
    const before = await writeSnapshot();

    expect((await preview(sunday)).statusCode).toBe(status);
    expect((await confirm(sunday)).statusCode).toBe(status);
    expect(await writeSnapshot()).toEqual(before);
  });
});

interface BlockInput extends ConfirmInput {
  blockId: string;
}

const blockUrl = ({ cycleId, eventId, blockId }: BlockInput, tail: string) =>
  `/api/v1/admin/cycles/${cycleId}/events/${eventId}/event-time-blocks/${blockId}/cancel${tail}`;

function previewBlock(input: BlockInput) {
  return app.inject({
    method: 'POST',
    url: blockUrl(input, '/preview'),
    cookies: { [testLocale.localeCookieName]: input.locale ?? 'en' },
  });
}

function confirmBlock(input: BlockInput) {
  return app.inject({
    method: 'POST',
    url: blockUrl(input, ''),
    payload: (input.payload ?? { confirmation: 'cancel' }) as never,
    cookies: { [testLocale.localeCookieName]: input.locale ?? 'en' },
  });
}

describe('POST …/event-time-blocks/:eventTimeBlockId/cancel(/preview)', () => {
  it('previews only the block and writes nothing', async () => {
    const sunday = await seedSentSunday();
    signIn({ sunday });
    const before = await writeSnapshot();

    const response = await previewBlock({
      ...sunday,
      blockId: sunday.serviceId,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      scope: { kind: 'eventTimeBlock', eventTimeBlockId: sunday.serviceId },
      start: at('10:00'),
      end: at('12:00'),
      volunteerCount: 1,
      ministryCount: 1,
      openSwapRequestCount: 0,
    });
    expect(await writeSnapshot()).toEqual(before);
  });

  it('cancels only that block while a sibling has started, leaving Event and sibling untouched', async () => {
    const sunday = await seedSentSunday();
    signIn({ sunday });
    setTestClock({ instant: at('09:30') });
    const actingUserId = sunday.seed.adminUserId;

    const response = await confirmBlock({
      ...sunday,
      blockId: sunday.serviceId,
      payload: { confirmation: ' Cancel' },
    });

    expect(response.statusCode).toBe(200);
    const blocks = await db.select().from(eventTimeBlock);
    expect(
      Object.fromEntries(blocks.map(({ id, status }) => [id, status])),
    ).toEqual({
      [sunday.welcomeId]: 'active',
      [sunday.serviceId]: 'cancelled',
    });
    const [sundayRow] = await db.select().from(event);
    expect(sundayRow?.status).toBe('scheduled');
    const { anaWelcome, biaService, caioService, daniService } = sunday;
    expect(await statusOf(biaService.assignment.id)).toBe('cancelled');
    expect(await statusOf(caioService.assignment.id)).toBe('cancelled');
    expect(await statusOf(daniService.assignment.id)).toBe('declined');
    expect(await statusOf(anaWelcome.assignment.id)).toBe('confirmed');
    const audits = await db.select().from(assignmentAudit);
    expect(audits.map(({ assignmentId }) => assignmentId).sort()).toEqual(
      [biaService.assignment.id, caioService.assignment.id].sort(),
    );
    for (const audit of audits) {
      expect(audit).toMatchObject({
        actorId: actingUserId,
        action: 'event_cancelled',
      });
    }
    // Ana's open SwapRequest is on the sibling and stays open.
    expect(await db.select().from(swapRequest)).toMatchObject([
      { status: 'open' },
    ]);
    // Only Bia's mark (on the cancelled block) is dropped.
    expect(await db.select().from(unavailableShift)).toMatchObject([
      { shiftId: anaWelcome.shift.id },
    ]);
    const told = await db.select().from(scheduleLastTold);
    expect(
      told.find(({ volunteerId }) => volunteerId === sunday.ana.volunteer.id)
        ?.assignments,
    ).toEqual([
      { assignmentId: anaWelcome.assignment.id, eventTitle: 'Sunday' },
      sunday.unrelated,
    ]);
    expect(
      told.find(({ volunteerId }) => volunteerId === sunday.bia.volunteer.id)
        ?.assignments,
    ).toEqual([]);
  });

  it('refuses a started block with the admin window code and writes nothing', async () => {
    const sunday = await seedSentSunday();
    signIn({ sunday });
    setTestClock({ instant: at('09:30') });
    const before = await writeSnapshot();
    const input = { ...sunday, blockId: sunday.welcomeId };

    const previewed = await previewBlock(input);
    const response = await confirmBlock(input);

    expect(previewed.statusCode).toBe(409);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'ADMIN_CANCELLATION_WINDOW_CLOSED',
    });
    expect(await writeSnapshot()).toEqual(before);
  });

  it('answers 404 to an unknown block or a block of another Event', async () => {
    const sunday = await seedSentSunday();
    signIn({ sunday });
    const other = await buildEvent({
      db,
      churchId: sunday.churchId,
      cycleId: sunday.cycleId,
      title: 'Other',
      start: at('14:00'),
      end: at('15:00'),
      status: 'scheduled',
    });
    const foreign = await buildEventTimeBlock({
      db,
      churchId: sunday.churchId,
      eventId: other.id,
      start: at('14:00'),
      end: at('15:00'),
      label: 'Foreign',
    });
    const before = await writeSnapshot();

    for (const blockId of [crypto.randomUUID(), foreign.id]) {
      expect((await previewBlock({ ...sunday, blockId })).statusCode).toBe(404);
      expect((await confirmBlock({ ...sunday, blockId })).statusCode).toBe(404);
    }
    expect(await writeSnapshot()).toEqual(before);
  });

  it('refuses a repeated cancel with 409 and writes nothing more', async () => {
    const sunday = await seedSentSunday();
    signIn({ sunday });
    const input = { ...sunday, blockId: sunday.serviceId };
    expect((await confirmBlock(input)).statusCode).toBe(200);
    const after = await writeSnapshot();

    const again = await confirmBlock(input);

    expect(again.statusCode).toBe(409);
    expect(await writeSnapshot()).toEqual(after);
  });

  it('enqueues N9 for the block Shifts only and N10 with the block bounds and its told counts', async () => {
    const sunday = await seedSentSunday();
    signIn({ sunday });
    await seedOtherAdmin({ sunday });

    await confirmBlock({ ...sunday, blockId: sunday.serviceId });

    const payloads = await outboxPayloads();
    const n9 = payloads.filter(({ kind }) => kind === 'event_cancelled');
    // Only Bia (published, Service); Ana's Welcome work is not part of it.
    expect(n9.map(({ to }) => to.userId)).toEqual([sunday.bia.userId]);
    expect(n9[0]?.data).toMatchObject({
      shifts: [
        { startsAt: at('10:00'), endsAt: at('12:00'), roleName: 'Usher' },
      ],
    });
    const n10 = payloads.filter(({ kind }) => kind === 'event_changed');
    expect(n10).toHaveLength(2);
    const impacts = n10.flatMap(
      ({ data }) =>
        (
          data.change as {
            impacts: { ministryName: string; volunteerCount: number }[];
          }
        ).impacts,
    );
    expect(
      impacts.sort((a, b) => a.ministryName.localeCompare(b.ministryName)),
    ).toEqual([
      expect.objectContaining({
        ministryName: 'Scheduling Ministry A',
        volunteerCount: 1,
      }),
      expect.objectContaining({
        ministryName: 'Zeta Media',
        volunteerCount: 0,
      }),
    ]);
    for (const { data } of n10) {
      expect(data.change).toMatchObject({
        kind: 'cancel',
        start: at('10:00'),
        end: at('12:00'),
      });
    }
  });
});
