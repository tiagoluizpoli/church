import {
  event,
  eventTimeBlock,
  ministry,
  ministryParticipation,
  outboxMessage,
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
import { and, eq, isNull } from 'drizzle-orm';
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
import {
  ChurchId,
  MinistryId,
  UserId,
  VolunteerId,
} from '@/domain/branded-ids';
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
import { buildCycle } from '@/seeds/builders/scheduling';
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
const CYCLE_START = '2026-10-12';
const CYCLE_END = '2026-10-25';

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
  // Real managers, repositories, PostgreSQL and AuthorityService decision;
  // only the session, the Active Church selection and the actor are seams.
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

type Persona = 'admin' | 'member' | 'leader';

interface SignInInput {
  persona?: Persona;
}

/** A signed-in actor of Church A; the ChurchAdmin has no Volunteer profile. */
async function signIn({ persona = 'admin' }: SignInInput = {}) {
  const seed = await seedSchedulingPhase3Base();
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

interface PostEventInput {
  cycleId: string;
  payload: unknown;
  locale?: 'en' | 'pt-BR';
}

function postEvent({ cycleId, payload, locale }: PostEventInput) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/admin/cycles/${cycleId}/events`,
    payload: payload as never,
    cookies: locale ? { [testLocale.localeCookieName]: locale } : {},
  });
}

const EVENING_START = local({ day: '2026-10-14', time: '19:00' });
const EVENING_END = local({ day: '2026-10-14', time: '21:00' });

function eveningEvent() {
  return {
    title: 'Evening service',
    location: 'Main hall',
    start: EVENING_START,
    end: EVENING_END,
    eventTimeBlocks: [
      {
        label: 'Evening service',
        startTime: EVENING_START,
        endTime: EVENING_END,
      },
    ],
  };
}

async function graphCounts() {
  const [events, blocks, participations, shifts, outbox] = await Promise.all([
    db.select().from(event),
    db.select().from(eventTimeBlock),
    db.select().from(ministryParticipation),
    db.select().from(shift),
    db.select().from(outboxMessage),
  ]);
  return {
    events: events.length,
    eventTimeBlocks: blocks.length,
    participations: participations.length,
    shifts: shifts.length,
    outbox: outbox.length,
  };
}

const EMPTY_GRAPH = {
  events: 0,
  eventTimeBlocks: 0,
  participations: 0,
  shifts: 0,
  outbox: 0,
};

describe('POST /admin/cycles/:cycleId/events', () => {
  it('saves an evening Event with its Time block and participation scaffold, seeding no staffing', async () => {
    const seed = await signIn();
    const target = await seedCycle({ churchId: seed.churchAId });

    const response = await postEvent({
      cycleId: target.id,
      payload: eveningEvent(),
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.event).toMatchObject({
      cycleId: target.id,
      title: 'Evening service',
      location: 'Main hall',
      start: '2026-10-14T22:00:00.000Z',
      end: '2026-10-15T00:00:00.000Z',
      status: 'draft',
    });
    expect(body.event.sourceTemplateId).toBeUndefined();
    expect(body.eventTimeBlocks).toEqual([
      expect.objectContaining({
        eventId: body.event.id,
        label: 'Evening service',
        startTime: '2026-10-14T22:00:00.000Z',
        endTime: '2026-10-15T00:00:00.000Z',
      }),
    ]);

    const [storedBlock] = await db
      .select()
      .from(eventTimeBlock)
      .where(eq(eventTimeBlock.eventId, body.event.id));
    expect(storedBlock?.sourceTemplateTimeBlockId).toBeNull();
    const activeMinistries = await db
      .select()
      .from(ministry)
      .where(
        and(eq(ministry.churchId, seed.churchAId), isNull(ministry.deletedAt)),
      );
    expect(await graphCounts()).toEqual({
      events: 1,
      eventTimeBlocks: 1,
      participations: activeMinistries.length,
      shifts: 0,
      outbox: 0,
    });
  });

  it('saves a multi-day retreat whose blocks span days, overlap, leave gaps and run overnight', async () => {
    const seed = await signIn();
    const target = await seedCycle({ churchId: seed.churchAId });
    const start = local({ day: '2026-10-16', time: '18:00' });
    const end = local({ day: '2026-10-18', time: '12:00' });
    const blocks = [
      { label: 'Whole retreat', startTime: start, endTime: end },
      {
        label: 'Friday night',
        startTime: local({ day: '2026-10-16', time: '19:00' }),
        endTime: local({ day: '2026-10-16', time: '23:30' }),
      },
      {
        label: 'Vigil',
        startTime: local({ day: '2026-10-17', time: '22:00' }),
        endTime: local({ day: '2026-10-18', time: '02:00' }),
      },
    ];

    const response = await postEvent({
      cycleId: target.id,
      payload: { title: 'Retreat', start, end, eventTimeBlocks: blocks },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(
      body.eventTimeBlocks.map(
        ({ label, startTime, endTime }: Record<string, string>) => ({
          label,
          startTime,
          endTime,
        }),
      ),
    ).toEqual(blocks);
    const stored = await db
      .select()
      .from(eventTimeBlock)
      .where(eq(eventTimeBlock.eventId, body.event.id));
    expect(stored).toHaveLength(3);
  });

  it('accepts a start on the last included day whose end spills past the Cycle', async () => {
    const seed = await signIn();
    const target = await seedCycle({ churchId: seed.churchAId });
    // 23:30 on 25 October in São Paulo is already 26 October in UTC.
    const start = local({ day: CYCLE_END, time: '23:30' });
    const end = local({ day: '2026-10-27', time: '10:00' });

    const response = await postEvent({
      cycleId: target.id,
      payload: {
        title: 'Overnight retreat',
        start,
        end,
        eventTimeBlocks: [{ label: 'Retreat', startTime: start, endTime: end }],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().event.start).toBe('2026-10-26T02:30:00.000Z');
  });

  it('refuses a Church-local start after the Cycle with a localized EVENT_OUTSIDE_CYCLE', async () => {
    const seed = await signIn();
    const target = await seedCycle({ churchId: seed.churchAId });
    const start = local({ day: '2026-10-26', time: '00:30' });
    const end = local({ day: '2026-10-26', time: '02:00' });

    const response = await postEvent({
      cycleId: target.id,
      locale: 'pt-BR',
      payload: {
        title: 'Late',
        start,
        end,
        eventTimeBlocks: [{ label: 'Late', startTime: start, endTime: end }],
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'EVENT_OUTSIDE_CYCLE',
      message: m.error_event_outside_cycle({}, { locale: 'pt-BR' }),
    });
    expect(await graphCounts()).toEqual(EMPTY_GRAPH);
  });

  it('refuses an Event without Time blocks with LAST_REMAINING_EVENT_TIME_BLOCK', async () => {
    const seed = await signIn();
    const target = await seedCycle({ churchId: seed.churchAId });

    const response = await postEvent({
      cycleId: target.id,
      payload: { ...eveningEvent(), eventTimeBlocks: [] },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('LAST_REMAINING_EVENT_TIME_BLOCK');
    expect(await graphCounts()).toEqual(EMPTY_GRAPH);
  });

  const EARLY = local({ day: '2026-10-14', time: '18:00' });
  const MIDDLE = local({ day: '2026-10-14', time: '20:00' });

  it.each([
    {
      name: 'an Event ending at its start',
      patch: { end: EVENING_START },
      reason: 'INVALID_EVENT_BOUNDS',
      field: 'end',
    },
    {
      name: 'a Time block ending before it starts',
      patch: {
        eventTimeBlocks: [
          { label: 'Service', startTime: MIDDLE, endTime: EVENING_START },
        ],
      },
      reason: 'INVALID_EVENT_BOUNDS',
      field: 'eventTimeBlocks.0.endTime',
    },
    {
      name: 'a Time block starting before the Event',
      patch: {
        eventTimeBlocks: [
          { label: 'Service', startTime: EARLY, endTime: MIDDLE },
        ],
      },
      reason: 'EVENT_TIME_BLOCK_OUT_OF_BOUNDS',
      field: 'eventTimeBlocks.0',
    },
    {
      name: 'labels equal ignoring case and spaces',
      patch: {
        eventTimeBlocks: [
          { label: 'Service', startTime: EVENING_START, endTime: MIDDLE },
          { label: ' SERVICE ', startTime: MIDDLE, endTime: EVENING_END },
        ],
      },
      reason: 'DUPLICATE_EVENT_TIME_BLOCK_LABEL',
      field: 'eventTimeBlocks.1.label',
    },
  ])('refuses $name with a field-aware 422 and writes nothing', async ({
    patch,
    reason,
    field,
  }) => {
    const seed = await signIn();
    const target = await seedCycle({ churchId: seed.churchAId });

    const response = await postEvent({
      cycleId: target.id,
      payload: { ...eveningEvent(), ...patch },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      error: 'VALIDATION_ERROR',
      reason,
      field,
    });
    expect(await graphCounts()).toEqual(EMPTY_GRAPH);
  });

  it('localizes a refused duplicate label in pt-BR', async () => {
    const seed = await signIn();
    const target = await seedCycle({ churchId: seed.churchAId });

    const response = await postEvent({
      cycleId: target.id,
      locale: 'pt-BR',
      payload: {
        ...eveningEvent(),
        eventTimeBlocks: [
          { label: 'Culto', startTime: EVENING_START, endTime: MIDDLE },
          { label: 'culto', startTime: MIDDLE, endTime: EVENING_END },
        ],
      },
    });

    expect(response.json().message).toBe(
      m.error_validation_duplicate_event_time_block_label(
        {},
        { locale: 'pt-BR' },
      ),
    );
  });

  it.each([
    { name: 'a blank title', patch: { title: '   ' } },
    {
      name: 'a blank Time block label',
      patch: {
        eventTimeBlocks: [
          { label: '  ', startTime: EVENING_START, endTime: EVENING_END },
        ],
      },
    },
    { name: 'a malformed Instant', patch: { start: '2026-10-14 19:00' } },
    { name: 'missing Time blocks', patch: { eventTimeBlocks: undefined } },
  ])('refuses $name as a request VALIDATION_ERROR', async ({ patch }) => {
    const seed = await signIn();
    const target = await seedCycle({ churchId: seed.churchAId });

    const response = await postEvent({
      cycleId: target.id,
      payload: { ...eveningEvent(), ...patch },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error).toBe('VALIDATION_ERROR');
    expect(await graphCounts()).toEqual(EMPTY_GRAPH);
  });

  it('trims the title, labels and a blank location', async () => {
    const seed = await signIn();
    const target = await seedCycle({ churchId: seed.churchAId });

    const response = await postEvent({
      cycleId: target.id,
      payload: {
        ...eveningEvent(),
        title: '  Evening service ',
        location: '   ',
        eventTimeBlocks: [
          {
            label: ' Service ',
            startTime: EVENING_START,
            endTime: EVENING_END,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.event.title).toBe('Evening service');
    expect(body.event.location).toBeUndefined();
    expect(body.eventTimeBlocks[0].label).toBe('Service');
  });

  it('leaves no Event, block or scaffold when a block write fails', async () => {
    const seed = await signIn();
    const target = await seedCycle({ churchId: seed.churchAId });
    const original =
      DrizzlePlanningEventRepository.prototype.createEventTimeBlock;
    let calls = 0;
    vi.spyOn(
      DrizzlePlanningEventRepository.prototype,
      'createEventTimeBlock',
    ).mockImplementation(async function (
      this: DrizzlePlanningEventRepository,
      input,
    ) {
      calls += 1;
      if (calls === 2) {
        throw new Error('block insert failed');
      }
      return original.call(this, input);
    });

    const response = await postEvent({
      cycleId: target.id,
      payload: {
        ...eveningEvent(),
        eventTimeBlocks: [
          { label: 'First', startTime: EVENING_START, endTime: MIDDLE },
          { label: 'Second', startTime: MIDDLE, endTime: EVENING_END },
        ],
      },
    });

    expect(response.statusCode).toBe(500);
    expect(calls).toBe(2);
    expect(await graphCounts()).toEqual(EMPTY_GRAPH);
  });

  it.each([
    'sent',
    'past',
  ] as const)('refuses a %s Cycle with ILLEGAL_STATE_TRANSITION', async (state) => {
    const seed = await signIn();
    const target = await seedCycle({ churchId: seed.churchAId, state });

    const response = await postEvent({
      cycleId: target.id,
      payload: eveningEvent(),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('ILLEGAL_STATE_TRANSITION');
    expect(await graphCounts()).toEqual(EMPTY_GRAPH);
  });
});

describe('Add Event access', () => {
  it('returns 401 signed out', async () => {
    const seed = await seedSchedulingPhase3Base();
    const target = await seedCycle({ churchId: seed.churchAId });
    mockGetSession.mockResolvedValue(null as never);

    const response = await postEvent({
      cycleId: target.id,
      payload: eveningEvent(),
    });

    expect(response.statusCode).toBe(401);
    expect(await graphCounts()).toEqual(EMPTY_GRAPH);
  });

  it.each([
    'member',
    'leader',
  ] as const)('returns 403 to a %s without the ChurchAdmin capability', async (persona) => {
    const seed = await signIn({ persona });
    const target = await seedCycle({ churchId: seed.churchAId });

    const response = await postEvent({
      cycleId: target.id,
      payload: eveningEvent(),
    });

    expect(response.statusCode).toBe(403);
    expect(await graphCounts()).toEqual(EMPTY_GRAPH);
  });

  it('returns the same 404 for a missing and a foreign Cycle', async () => {
    const seed = await signIn();
    const foreign = await seedCycle({ churchId: seed.churchBId });

    const missing = await postEvent({
      cycleId: '00000000-0000-4000-8000-000000000000',
      payload: eveningEvent(),
    });
    const other = await postEvent({
      cycleId: foreign.id,
      payload: eveningEvent(),
    });

    expect(missing.statusCode).toBe(404);
    expect(other.statusCode).toBe(404);
    expect(other.json()).toEqual(missing.json());
    expect(await graphCounts()).toEqual(EMPTY_GRAPH);
  });
});
