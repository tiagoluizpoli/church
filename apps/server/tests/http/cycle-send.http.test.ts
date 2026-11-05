import {
  cycle,
  event,
  ministry,
  outboxMessage,
  participationEventTimeBlockInclusion,
  shift,
} from '@church/db';
import { m } from '@church/i18n/messages';
import {
  parseCalendarDay,
  parseInstant,
  parseTimeOfDay,
  resetClock,
  setTestClock,
  toInstant,
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
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbCycleManager } from '@/application/db-cycle-manager';
import { DbEventTemplateManager } from '@/application/db-event-template-manager';
import { DbPlanningEventManager } from '@/application/db-planning-event-manager';
import { UsualSetupStaffingSeeder } from '@/application/usual-setup-staffing-seeder';
import { ChurchId, MinistryId, UserId } from '@/domain/branded-ids';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleCycleRepository } from '@/infrastructure/repositories/drizzle-cycle.repository';
import { DrizzleEventTemplateRepository } from '@/infrastructure/repositories/drizzle-event-template.repository';
import { DrizzleEventTimeBlockRepository } from '@/infrastructure/repositories/drizzle-event-time-block.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleMinistryParticipationRepository } from '@/infrastructure/repositories/drizzle-ministry-participation.repository';
import { DrizzleOutboxRepository } from '@/infrastructure/repositories/drizzle-outbox.repository';
import { DrizzlePlanningEventRepository } from '@/infrastructure/repositories/drizzle-planning-event.repository';
import { DrizzleShiftRepository } from '@/infrastructure/repositories/drizzle-shift.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { DrizzleUsualSetupRepository } from '@/infrastructure/repositories/drizzle-usual-setup.repository';
import { DrizzleVolunteerRepository } from '@/infrastructure/repositories/drizzle-volunteer.repository';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import { buildMinistry } from '@/seeds/builders/ministry';
import { buildEventTemplate, buildUsualSetup } from '@/seeds/builders/planning';
import {
  buildCycle,
  buildEvent,
  buildEventTimeBlock,
} from '@/seeds/builders/scheduling';
import {
  buildMinistryMembership,
  buildVolunteer,
} from '@/seeds/builders/volunteer';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';
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

/** Church A is America/Sao_Paulo (UTC-3, no DST). */
const CHURCH_TIME_ZONE = 'America/Sao_Paulo';
const CHURCH_OCTOBER_1_NOON = '2026-10-01T15:00:00.000Z';
/** Holds two Sundays: 2026-10-18 and its last day, 2026-10-25. */
const CYCLE_START = '2026-10-12';
const CYCLE_END = '2026-10-25';
const SUNDAY = 0;

let app: FastifyTypedInstance;

beforeAll(async () => {
  const churchRepository = new DrizzleChurchRepository({ db });
  const cycleRepository = new DrizzleCycleRepository({ db });
  const eventRepository = new DrizzlePlanningEventRepository({ db });
  const unitOfWork = new DrizzleUnitOfWork({ db });
  const participationRepository = new DrizzleMinistryParticipationRepository({
    db,
  });
  const templateRepository = new DrizzleEventTemplateRepository({ db });
  app = await createFastify({ locale: testLocale });
  const controller = new ChurchAdminController({
    cycleManager: new DbCycleManager({
      cycleRepository,
      eventRepository,
      churchRepository,
      unitOfWork,
      participationRepository,
      staffingSeeder: new UsualSetupStaffingSeeder({
        participationRepository,
        shiftRepository: new DrizzleShiftRepository({ db }),
        usualSetupRepository: new DrizzleUsualSetupRepository({ db }),
        ministryRepository: new DrizzleMinistryRepository({ db }),
      }),
      volunteerRepository: new DrizzleVolunteerRepository({ db }),
      notifications: new ChurchNotifications({
        outboxRepository: new DrizzleOutboxRepository({ db }),
      }),
    }),
    planningEventManager: new DbPlanningEventManager({
      cycleRepository,
      eventRepository,
      templateRepository,
      churchRepository,
      unitOfWork,
      eventTimeBlockRepository: new DrizzleEventTimeBlockRepository({ db }),
    }),
    eventTemplateManager: new DbEventTemplateManager({
      templateRepository,
      unitOfWork,
    }),
    activeChurchResolver: activeChurchResolver as never,
    ministryManager: {} as never,
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
  setTestClock({ instant: parseInstant({ value: CHURCH_OCTOBER_1_NOON }) });
  await resetSchedulingPhase3Db();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetClock();
});

type Persona = 'admin' | 'member';

interface SignInInput {
  persona?: Persona;
}

/**
 * The signed-in ChurchAdmin of Church A has no Volunteer profile on the
 * request (the seeded admin also leads Ministry A, which is a leadership fact
 * N2 reads, not an authorization one).
 */
async function signIn({ persona = 'admin' }: SignInInput = {}) {
  const seed = await seedSchedulingPhase3Base();
  const churchId = ChurchId.from(seed.churchAId);
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
    volunteerId: null,
    churchMembership: {
      churchId,
      accessLevel: persona === 'admin' ? 'admin' : 'member',
    },
    ministryMemberships: [],
  });
  return seed;
}

interface SeedCycleInput {
  churchId: string;
  state?: 'draft' | 'sent' | 'past';
}

function seedCycle({ churchId, state = 'draft' }: SeedCycleInput) {
  return buildCycle({
    db,
    churchId,
    name: 'October',
    state,
    startDate: parseCalendarDay({ value: CYCLE_START }),
    endDate: parseCalendarDay({ value: CYCLE_END }),
  });
}

interface LocalInput {
  day: string;
  time: string;
}

/** A Church-local wall clock in São Paulo, as the wire Instant. */
function local({ day, time }: LocalInput): string {
  return toInstant({
    day: parseCalendarDay({ value: day }),
    time: parseTimeOfDay({ value: time }),
    timeZone: CHURCH_TIME_ZONE,
  });
}

interface RequestInput {
  cycleId: string;
  locale?: 'en' | 'pt-BR';
}

function cookies(locale?: 'en' | 'pt-BR') {
  return locale ? { [testLocale.localeCookieName]: locale } : {};
}

function getSummary({ cycleId, locale }: RequestInput) {
  return app.inject({
    method: 'GET',
    url: `/api/v1/admin/cycles/${cycleId}/send-summary`,
    cookies: cookies(locale),
  });
}

function send({ cycleId, locale }: RequestInput) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/admin/cycles/${cycleId}/send`,
    cookies: cookies(locale),
  });
}

/** A one-off evening Event on the Cycle's first Wednesday. */
function postEvening({ cycleId }: RequestInput) {
  const start = local({ day: '2026-10-14', time: '19:00' });
  const end = local({ day: '2026-10-14', time: '21:00' });
  return app.inject({
    method: 'POST',
    url: `/api/v1/admin/cycles/${cycleId}/events`,
    payload: {
      title: 'Evening service',
      start,
      end,
      eventTimeBlocks: [
        { label: 'Evening service', startTime: start, endTime: end },
      ],
    },
  });
}

interface ApplySundayInput {
  churchId: string;
  cycleId: string;
}

/** Applies a Sunday 09–12 template: two Events with one template-sourced block. */
async function applySunday({ churchId, cycleId }: ApplySundayInput) {
  const sunday = await buildEventTemplate({
    db,
    churchId,
    name: 'Sunday',
    weekday: SUNDAY,
    blocks: [
      {
        label: 'Service',
        startTime: parseTimeOfDay({ value: '09:00' }),
        endTime: parseTimeOfDay({ value: '12:00' }),
      },
    ],
  });
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/admin/cycles/${cycleId}/apply-templates`,
    payload: { templateIds: [sunday.template.id] },
  });
  expect(response.statusCode).toBe(201);
  const [block] = sunday.blocks;
  if (!block) throw new Error('Sunday block');
  return { block };
}

async function cycleState(cycleId: string) {
  const [row] = await db
    .select({ state: cycle.state })
    .from(cycle)
    .where(eq(cycle.id, cycleId));
  const events = await db
    .select({ status: event.status })
    .from(event)
    .where(eq(event.cycleId, cycleId));
  return {
    state: row?.state,
    events: [...new Set(events.map(({ status }) => status))].sort(),
  };
}

interface QueuedNotification {
  userId: string;
  kind: string;
  data: { cycleId: string; ministryIds: string[] };
}

/** Each queued N2 as recipient → captured identifiers, in recipient order. */
async function queuedNotifications(): Promise<QueuedNotification[]> {
  const rows = await db.select().from(outboxMessage);
  return rows
    .map((row) => {
      const payload = row.payload as {
        to: { userId: string };
        kind: string;
        data: QueuedNotification['data'];
      };
      return {
        userId: payload.to.userId,
        kind: payload.kind,
        data: {
          ...payload.data,
          ministryIds: [...payload.data.ministryIds].sort(),
        },
      };
    })
    .sort((left, right) => left.userId.localeCompare(right.userId));
}

async function staffingCounts() {
  const [inclusions, shifts] = await Promise.all([
    db.select().from(participationEventTimeBlockInclusion),
    db.select().from(shift),
  ]);
  return { inclusions: inclusions.length, shifts: shifts.length };
}

interface LeaderInput {
  churchId: string;
  userId: string;
  ministryIds: string[];
  status?: 'active' | 'inactive';
  ministryAccessLevel?: 'leader' | 'volunteer';
  retired?: boolean;
}

/** A Church member whose current profile holds these memberships. */
async function seedMember({
  churchId,
  userId,
  ministryIds,
  status = 'active',
  ministryAccessLevel = 'leader',
  retired = false,
}: LeaderInput) {
  await buildUser({
    db,
    id: userId,
    name: userId,
    email: `${userId}@test.com`,
  });
  await buildChurchMembership({ db, churchId, userId, accessLevel: 'member' });
  const volunteer = await buildVolunteer({
    db,
    churchId,
    userId,
    leftAt: retired
      ? parseInstant({ value: '2026-09-01T00:00:00.000Z' })
      : undefined,
  });
  for (const ministryId of ministryIds) {
    await buildMinistryMembership({
      db,
      churchId,
      ministryId,
      volunteerId: volunteer.id,
      ministryAccessLevel,
      status,
      roleIds: [],
    });
  }
}

describe('GET /admin/cycles/:cycleId/send-summary', () => {
  it('counts Draft Events and the distinct active Ministries the Usual setup would pre-fill', async () => {
    const seed = await signIn();
    const churchId = seed.churchAId;
    // Ministry A (seeded) is all_out with no setup: not pre-filled.
    const allIn = await buildMinistry({
      db,
      churchId,
      name: 'All in',
      defaultDirection: 'all_in',
    });
    const served = await buildMinistry({ db, churchId, name: 'Served' });
    const optedOut = await buildMinistry({
      db,
      churchId,
      name: 'Opted out',
      defaultDirection: 'all_in',
    });
    const archived = await buildMinistry({
      db,
      churchId,
      name: 'Archived',
      defaultDirection: 'all_in',
    });
    const target = await seedCycle({ churchId });
    const { block } = await applySunday({ churchId, cycleId: target.id });
    for (const [ministryId, serves] of [
      [served.id, true],
      [optedOut.id, false],
    ] as const) {
      await buildUsualSetup({
        db,
        churchId,
        ministryId,
        sourceTemplateTimeBlockId: block.id,
        id: crypto.randomUUID(),
        serves,
        shiftSplit: { kind: 'equal', count: 1 },
        headcounts: [],
      });
    }
    await db
      .update(ministry)
      .set({ deletedAt: new Date() })
      .where(eq(ministry.id, archived.id));
    expect((await postEvening({ cycleId: target.id })).statusCode).toBe(201);

    const response = await getSummary({ cycleId: target.id });

    expect(response.statusCode).toBe(200);
    // Two Sundays and the one-off Event; All in and Served pre-fill, once each.
    expect(response.json()).toEqual({
      eventCount: 3,
      prefilledMinistryCount: 2,
    });
    expect(allIn.id).toBeDefined();
    expect(await staffingCounts()).toEqual({ inclusions: 0, shifts: 0 });
    expect(await queuedNotifications()).toEqual([]);
  });

  it('refuses an empty Draft with EMPTY_CYCLE and a Sent or Past Cycle with ILLEGAL_STATE_TRANSITION', async () => {
    const seed = await signIn();
    const empty = await seedCycle({ churchId: seed.churchAId });
    const sent = await buildCycle({
      db,
      churchId: seed.churchAId,
      name: 'Sent',
      state: 'sent',
      startDate: parseCalendarDay({ value: '2026-11-01' }),
      endDate: parseCalendarDay({ value: '2026-11-07' }),
    });

    const refusal = await getSummary({ cycleId: empty.id, locale: 'pt-BR' });
    const repeated = await getSummary({ cycleId: sent.id });

    expect(refusal.statusCode).toBe(409);
    expect(refusal.json()).toEqual({
      error: 'EMPTY_CYCLE',
      message: m.error_empty_cycle({}, { locale: 'pt-BR' }),
    });
    expect(repeated.statusCode).toBe(409);
    expect(repeated.json()).toMatchObject({
      error: 'ILLEGAL_STATE_TRANSITION',
    });
  });

  it('answers 401 signed out, 403 without the capability and the same 404 for missing and foreign Cycles', async () => {
    const seed = await signIn({ persona: 'member' });
    const target = await seedCycle({ churchId: seed.churchAId });
    const foreign = await seedCycle({ churchId: seed.churchBId });

    expect((await getSummary({ cycleId: target.id })).statusCode).toBe(403);
    expect((await send({ cycleId: target.id })).statusCode).toBe(403);

    actorRepository.resolveActor.mockResolvedValue({
      userId: UserId.from(seed.adminUserId),
      activeChurchId: ChurchId.from(seed.churchAId),
      volunteerId: null,
      churchMembership: {
        churchId: ChurchId.from(seed.churchAId),
        accessLevel: 'admin',
      },
      ministryMemberships: [],
    });
    const missing = await getSummary({ cycleId: crypto.randomUUID() });
    const foreignSummary = await getSummary({ cycleId: foreign.id });
    const foreignSend = await send({ cycleId: foreign.id });
    expect([
      missing.statusCode,
      foreignSummary.statusCode,
      foreignSend.statusCode,
    ]).toEqual([404, 404, 404]);
    expect(foreignSummary.json()).toEqual(missing.json());

    mockGetSession.mockResolvedValue(null as never);
    expect((await getSummary({ cycleId: target.id })).statusCode).toBe(401);
    expect((await send({ cycleId: target.id })).statusCode).toBe(401);
    expect(await cycleState(foreign.id)).toEqual({
      state: 'draft',
      events: [],
    });
  });
});

describe('POST /admin/cycles/:cycleId/send', () => {
  it('refuses an empty Draft with a localized EMPTY_CYCLE and writes nothing', async () => {
    const seed = await signIn();
    const target = await seedCycle({ churchId: seed.churchAId });

    const english = await send({ cycleId: target.id, locale: 'en' });
    const portuguese = await send({ cycleId: target.id, locale: 'pt-BR' });

    expect(english.statusCode).toBe(409);
    expect(english.json()).toEqual({
      error: 'EMPTY_CYCLE',
      message: m.error_empty_cycle({}, { locale: 'en' }),
    });
    expect(portuguese.json()).toEqual({
      error: 'EMPTY_CYCLE',
      message: m.error_empty_cycle({}, { locale: 'pt-BR' }),
    });
    expect(await cycleState(target.id)).toEqual({ state: 'draft', events: [] });
    expect(await queuedNotifications()).toEqual([]);
  });

  it('refuses legacy Events breaking the final-graph rules with INVALID_CYCLE_EVENTS, naming only those Events of this Cycle', async () => {
    const seed = await signIn();
    const churchId = seed.churchAId;
    const target = await seedCycle({ churchId });
    const other = await buildCycle({
      db,
      churchId,
      name: 'November',
      state: 'draft',
      startDate: parseCalendarDay({ value: '2026-11-01' }),
      endDate: parseCalendarDay({ value: '2026-11-07' }),
    });
    expect((await postEvening({ cycleId: target.id })).statusCode).toBe(201);
    // Legacy rows the old separate writes could leave behind.
    const blockless = await buildEvent({
      db,
      churchId,
      cycleId: target.id,
      title: 'Blockless',
      status: 'draft',
      start: parseInstant({
        value: local({ day: '2026-10-15', time: '19:00' }),
      }),
      end: parseInstant({ value: local({ day: '2026-10-15', time: '21:00' }) }),
    });
    const overflowing = await buildEvent({
      db,
      churchId,
      cycleId: target.id,
      title: 'Overflowing',
      status: 'draft',
      start: parseInstant({
        value: local({ day: '2026-10-16', time: '19:00' }),
      }),
      end: parseInstant({ value: local({ day: '2026-10-16', time: '21:00' }) }),
    });
    await buildEventTimeBlock({
      db,
      churchId,
      eventId: overflowing.id,
      label: 'Too long',
      start: parseInstant({
        value: local({ day: '2026-10-16', time: '19:00' }),
      }),
      end: parseInstant({ value: local({ day: '2026-10-16', time: '23:00' }) }),
    });
    await buildEvent({
      db,
      churchId,
      cycleId: other.id,
      title: 'Elsewhere',
      status: 'draft',
      start: parseInstant({
        value: local({ day: '2026-11-02', time: '19:00' }),
      }),
      end: parseInstant({ value: local({ day: '2026-11-02', time: '21:00' }) }),
    });

    const response = await send({ cycleId: target.id, locale: 'pt-BR' });

    expect(response.statusCode).toBe(409);
    const body = response.json();
    expect(body).toMatchObject({
      error: 'INVALID_CYCLE_EVENTS',
      message: m.error_invalid_cycle_events({}, { locale: 'pt-BR' }),
    });
    expect(
      body.invalidEvents.map(
        ({ id, title }: { id: string; title: string }) => ({
          id,
          title,
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        { id: blockless.id, title: 'Blockless' },
        { id: overflowing.id, title: 'Overflowing' },
      ]),
    );
    expect(body.invalidEvents).toHaveLength(2);
    expect((await getSummary({ cycleId: target.id })).json()).toMatchObject({
      error: 'INVALID_CYCLE_EVENTS',
    });
    expect(await cycleState(target.id)).toEqual({
      state: 'draft',
      events: ['draft'],
    });
    expect(await staffingCounts()).toEqual({ inclusions: 0, shifts: 0 });
    expect(await queuedNotifications()).toEqual([]);
  });

  it('enqueues one N2 per User actively leading an active Ministry of this Church, listing their Ministries', async () => {
    const seed = await signIn();
    const churchId = seed.churchAId;
    const worship = await buildMinistry({ db, churchId, name: 'Worship' });
    const kids = await buildMinistry({ db, churchId, name: 'Kids' });
    const archived = await buildMinistry({ db, churchId, name: 'Archived' });
    await seedMember({
      churchId,
      userId: 'two-ministry-leader',
      ministryIds: [worship.id, kids.id],
    });
    await seedMember({
      churchId,
      userId: 'co-leader',
      ministryIds: [worship.id],
    });
    await seedMember({
      churchId,
      userId: 'inactive-leader',
      ministryIds: [kids.id],
      status: 'inactive',
    });
    await seedMember({
      churchId,
      userId: 'archived-leader',
      ministryIds: [archived.id],
    });
    await seedMember({
      churchId,
      userId: 'volunteer-only',
      ministryIds: [worship.id],
      ministryAccessLevel: 'volunteer',
    });
    await seedMember({
      churchId,
      userId: 'retired-leader',
      ministryIds: [worship.id],
      retired: true,
    });
    await seedMember({
      churchId: seed.churchBId,
      userId: 'other-church-leader',
      ministryIds: [seed.ministryBId],
    });
    await buildUser({
      db,
      id: 'admin-only',
      name: 'Admin only',
      email: 'admin-only@test.com',
    });
    await buildChurchMembership({
      db,
      churchId,
      userId: 'admin-only',
      accessLevel: 'admin',
    });
    await db
      .update(ministry)
      .set({ deletedAt: new Date() })
      .where(eq(ministry.id, archived.id));
    const target = await seedCycle({ churchId });
    expect((await postEvening({ cycleId: target.id })).statusCode).toBe(201);

    const response = await send({ cycleId: target.id });

    expect(response.statusCode).toBe(204);
    expect(await cycleState(target.id)).toEqual({
      state: 'sent',
      events: ['scheduled'],
    });
    // Nobody is pre-filled (one-off block), yet every leader is told.
    expect(await staffingCounts()).toEqual({ inclusions: 0, shifts: 0 });
    const data = (ministryIds: string[]) => ({
      cycleId: target.id,
      ministryIds: [...ministryIds].sort(),
    });
    expect(await queuedNotifications()).toEqual([
      {
        userId: 'co-leader',
        kind: 'cycle_ready_to_prepare',
        data: data([worship.id]),
      },
      {
        userId: seed.adminUserId,
        kind: 'cycle_ready_to_prepare',
        data: data([seed.ministryAId]),
      },
      {
        userId: 'two-ministry-leader',
        kind: 'cycle_ready_to_prepare',
        data: data([worship.id, kids.id]),
      },
    ]);

    // Leadership gained after Send does not widen the captured recipients.
    await seedMember({
      churchId,
      userId: 'late-leader',
      ministryIds: [kids.id],
    });
    expect(await queuedNotifications()).toHaveLength(3);
  });

  it('still sends a Church with no eligible leader, queuing nothing and never falling back to admins', async () => {
    const seed = await signIn();
    const target = await seedCycle({ churchId: seed.churchAId });
    expect((await postEvening({ cycleId: target.id })).statusCode).toBe(201);
    await db
      .update(ministry)
      .set({ deletedAt: new Date() })
      .where(eq(ministry.id, MinistryId.from(seed.ministryAId)));

    expect((await send({ cycleId: target.id })).statusCode).toBe(204);

    expect(await cycleState(target.id)).toEqual({
      state: 'sent',
      events: ['scheduled'],
    });
    expect(await queuedNotifications()).toEqual([]);
  });

  it('rolls back the states, every staffing row and the outbox when the enqueue fails', async () => {
    const seed = await signIn();
    const churchId = seed.churchAId;
    await buildMinistry({
      db,
      churchId,
      name: 'All in',
      defaultDirection: 'all_in',
    });
    const target = await seedCycle({ churchId });
    await applySunday({ churchId, cycleId: target.id });
    // Fails after staffing rows were written and the state transitioned.
    vi.spyOn(ChurchNotifications.prototype, 'enqueue').mockRejectedValueOnce(
      new Error('outbox unavailable'),
    );

    expect((await send({ cycleId: target.id })).statusCode).toBe(500);

    expect(await cycleState(target.id)).toEqual({
      state: 'draft',
      events: ['draft'],
    });
    expect(await staffingCounts()).toEqual({ inclusions: 0, shifts: 0 });
    expect(await queuedNotifications()).toEqual([]);

    // Retrying the whole Send succeeds once the failure is gone.
    expect((await send({ cycleId: target.id })).statusCode).toBe(204);
    expect(await staffingCounts()).toEqual({ inclusions: 2, shifts: 2 });
    expect(await queuedNotifications()).toHaveLength(1);
  });

  it('serializes simultaneous Sends so the handoff and its N2 set happen once', async () => {
    const seed = await signIn();
    const target = await seedCycle({ churchId: seed.churchAId });
    expect((await postEvening({ cycleId: target.id })).statusCode).toBe(201);

    const results = await Promise.all([
      send({ cycleId: target.id }),
      send({ cycleId: target.id }),
    ]);

    expect(results.map(({ statusCode }) => statusCode).sort()).toEqual([
      204, 409,
    ]);
    const refused = results.find(({ statusCode }) => statusCode === 409);
    expect(refused?.json()).toMatchObject({
      error: 'ILLEGAL_STATE_TRANSITION',
    });
    expect(await queuedNotifications()).toHaveLength(1);
  });

  it('orders a racing Event write with Send: either the Event is sent with the Cycle or it is refused afterwards', async () => {
    const seed = await signIn();
    const target = await seedCycle({ churchId: seed.churchAId });
    expect((await postEvening({ cycleId: target.id })).statusCode).toBe(201);

    const [created, sent] = await Promise.all([
      postEvening({ cycleId: target.id }),
      send({ cycleId: target.id }),
    ]);

    expect(sent.statusCode).toBe(204);
    expect([201, 409]).toContain(created.statusCode);
    const events = await db
      .select({ status: event.status })
      .from(event)
      .where(eq(event.cycleId, target.id));
    expect(events).toHaveLength(created.statusCode === 201 ? 2 : 1);
    expect(new Set(events.map(({ status }) => status))).toEqual(
      new Set(['scheduled']),
    );
    expect(await queuedNotifications()).toHaveLength(1);
  });
});
