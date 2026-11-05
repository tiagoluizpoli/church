import { event, eventTimeBlock } from '@church/db';
import {
  parseCalendarDay,
  parseInstant,
  parseTimeOfDay,
  resetClock,
  setTestClock,
  toInstant,
} from '@church/time';
import { asc, eq } from 'drizzle-orm';
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
import { DrizzlePlanningEventRepository } from '@/infrastructure/repositories/drizzle-planning-event.repository';
import { DrizzleShiftRepository } from '@/infrastructure/repositories/drizzle-shift.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { DrizzleUsualSetupRepository } from '@/infrastructure/repositories/drizzle-usual-setup.repository';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildEventTemplate } from '@/seeds/builders/planning';
import {
  buildCycle,
  buildEvent,
  buildEventTimeBlock,
} from '@/seeds/builders/scheduling';
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

interface PatchEventInput {
  cycleId: string;
  eventId: string;
  payload: unknown;
}

function patchEvent({ cycleId, eventId, payload }: PatchEventInput) {
  return app.inject({
    method: 'PATCH',
    url: `/api/v1/admin/cycles/${cycleId}/events/${eventId}`,
    payload: payload as never,
  });
}

/** Sunday 2026-10-18 in São Paulo. */
const at = (time: string) => local({ day: '2026-10-18', time });

interface SeedGeneratedEventInput {
  churchId: string;
  cycleId: string;
}

/**
 * A Draft Event generated from the Sunday template, with its stored
 * description and two sourced blocks: Welcome 09–10 and Service 10–12.
 */
async function seedGeneratedEvent({
  churchId,
  cycleId,
}: SeedGeneratedEventInput) {
  const template = await buildEventTemplate({
    db,
    churchId,
    name: 'Sunday',
    weekday: 0,
    blocks: [
      {
        label: 'Welcome',
        startTime: parseTimeOfDay({ value: '09:00' }),
        endTime: parseTimeOfDay({ value: '10:00' }),
      },
      {
        label: 'Service',
        startTime: parseTimeOfDay({ value: '10:00' }),
        endTime: parseTimeOfDay({ value: '12:00' }),
      },
    ],
  });
  const [welcomeSource, serviceSource] = template.blocks;
  if (!welcomeSource || !serviceSource) throw new Error('template blocks');
  const row = await buildEvent({
    db,
    churchId,
    cycleId,
    title: 'Sunday',
    start: parseInstant({ value: at('09:00') }),
    end: parseInstant({ value: at('12:00') }),
    status: 'draft',
    sourceTemplateId: template.template.id,
  });
  await db
    .update(event)
    .set({ description: 'Stored description', location: 'Main hall' })
    .where(eq(event.id, row.id));
  const welcome = await buildEventTimeBlock({
    db,
    churchId,
    eventId: row.id,
    start: parseInstant({ value: at('09:00') }),
    end: parseInstant({ value: at('10:00') }),
    label: 'Welcome',
    sourceTemplateTimeBlockId: welcomeSource.id,
  });
  const service = await buildEventTimeBlock({
    db,
    churchId,
    eventId: row.id,
    start: parseInstant({ value: at('10:00') }),
    end: parseInstant({ value: at('12:00') }),
    label: 'Service',
    sourceTemplateTimeBlockId: serviceSource.id,
  });
  return {
    eventId: row.id,
    templateId: template.template.id,
    welcome,
    service,
    welcomeSourceId: welcomeSource.id,
    serviceSourceId: serviceSource.id,
  };
}

type Fixture = Awaited<ReturnType<typeof seedGeneratedEvent>>;

/** The unchanged desired graph of the seeded Event. */
function currentGraph(fixture: Fixture) {
  return {
    title: 'Sunday',
    location: 'Main hall',
    start: at('09:00'),
    end: at('12:00'),
    eventTimeBlocks: [
      {
        id: fixture.welcome.id,
        label: 'Welcome',
        startTime: at('09:00'),
        endTime: at('10:00'),
      },
      {
        id: fixture.service.id,
        label: 'Service',
        startTime: at('10:00'),
        endTime: at('12:00'),
      },
    ],
  };
}

/** Every stored Event and block row, ordered, for unchanged-graph checks. */
async function storedGraph() {
  const events = await db.select().from(event).orderBy(asc(event.id));
  const blocks = await db
    .select()
    .from(eventTimeBlock)
    .orderBy(asc(eventTimeBlock.id));
  return { events, blocks };
}

async function setUp() {
  const seed = await signIn();
  const target = await seedCycle({ churchId: seed.churchAId });
  const fixture = await seedGeneratedEvent({
    churchId: seed.churchAId,
    cycleId: target.id,
  });
  return { seed, cycleId: target.id, fixture };
}

describe('PATCH /admin/cycles/:cycleId/events/:eventId', () => {
  it('updates retained blocks in place, creates absent ids, deletes omitted ones and keeps identities', async () => {
    const { cycleId, fixture } = await setUp();

    const response = await patchEvent({
      cycleId,
      eventId: fixture.eventId,
      payload: {
        title: 'Sunday gathering',
        start: at('08:00'),
        end: at('13:00'),
        eventTimeBlocks: [
          {
            id: fixture.welcome.id,
            label: 'Arrival',
            startTime: at('08:00'),
            endTime: at('09:30'),
          },
          { label: 'Lunch', startTime: at('12:00'), endTime: at('13:00') },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.event).toMatchObject({
      id: fixture.eventId,
      title: 'Sunday gathering',
      start: '2026-10-18T11:00:00.000Z',
      end: '2026-10-18T16:00:00.000Z',
      status: 'draft',
      sourceTemplateId: fixture.templateId,
    });
    expect(body.event.location).toBeUndefined();
    expect(body.eventTimeBlocks).toEqual([
      expect.objectContaining({
        id: fixture.welcome.id,
        label: 'Arrival',
        startTime: '2026-10-18T11:00:00.000Z',
        endTime: '2026-10-18T12:30:00.000Z',
      }),
      expect.objectContaining({
        label: 'Lunch',
        startTime: '2026-10-18T15:00:00.000Z',
        endTime: '2026-10-18T16:00:00.000Z',
      }),
    ]);

    const [storedEvent] = await db
      .select()
      .from(event)
      .where(eq(event.id, fixture.eventId));
    expect(storedEvent).toMatchObject({
      description: 'Stored description',
      location: null,
      sourceTemplateId: fixture.templateId,
    });
    const blocks = await db
      .select()
      .from(eventTimeBlock)
      .where(eq(eventTimeBlock.eventId, fixture.eventId))
      .orderBy(asc(eventTimeBlock.startTime));
    expect(
      blocks.map(({ id, label, sourceTemplateTimeBlockId }) => ({
        id,
        label,
        sourceTemplateTimeBlockId,
      })),
    ).toEqual([
      {
        id: fixture.welcome.id,
        label: 'Arrival',
        sourceTemplateTimeBlockId: fixture.welcomeSourceId,
      },
      {
        id: body.eventTimeBlocks[1].id,
        label: 'Lunch',
        sourceTemplateTimeBlockId: null,
      },
    ]);
  });

  it('saves submitted absolute bounds exactly, without the legacy Event-start delta', async () => {
    const { cycleId, fixture } = await setUp();
    const graph = currentGraph(fixture);

    const response = await patchEvent({
      cycleId,
      eventId: fixture.eventId,
      // The Event starts an hour earlier; the blocks keep their own times.
      payload: { ...graph, start: at('08:00') },
    });

    expect(response.statusCode).toBe(200);
    const blocks = await db
      .select()
      .from(eventTimeBlock)
      .where(eq(eventTimeBlock.eventId, fixture.eventId))
      .orderBy(asc(eventTimeBlock.startTime));
    expect(
      blocks.map(({ startTime, endTime }) => [
        startTime.toISOString(),
        endTime.toISOString(),
      ]),
    ).toEqual([
      ['2026-10-18T12:00:00.000Z', '2026-10-18T13:00:00.000Z'],
      ['2026-10-18T13:00:00.000Z', '2026-10-18T15:00:00.000Z'],
    ]);
  });

  it('refuses a shrink that leaves a retained block outside and keeps the original graph', async () => {
    const { cycleId, fixture } = await setUp();
    const before = await storedGraph();

    const response = await patchEvent({
      cycleId,
      eventId: fixture.eventId,
      payload: { ...currentGraph(fixture), end: at('11:00') },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      error: 'VALIDATION_ERROR',
      reason: 'EVENT_TIME_BLOCK_OUT_OF_BOUNDS',
      field: 'eventTimeBlocks.1',
    });
    expect(await storedGraph()).toEqual(before);
  });

  it('saves a shrink once every final block fits', async () => {
    const { cycleId, fixture } = await setUp();
    const graph = currentGraph(fixture);

    const response = await patchEvent({
      cycleId,
      eventId: fixture.eventId,
      payload: {
        ...graph,
        end: at('11:00'),
        eventTimeBlocks: [
          graph.eventTimeBlocks[0],
          { ...graph.eventTimeBlocks[1], endTime: at('11:00') },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().eventTimeBlocks[1]).toMatchObject({
      id: fixture.service.id,
      endTime: '2026-10-18T14:00:00.000Z',
    });
  });

  it.each([
    {
      name: 'a repeated block id',
      change: (fixture: Fixture) => ({
        eventTimeBlocks: [
          currentGraph(fixture).eventTimeBlocks[0],
          {
            ...currentGraph(fixture).eventTimeBlocks[1],
            id: fixture.welcome.id,
          },
        ],
      }),
      reason: 'DUPLICATE_EVENT_TIME_BLOCK_ID',
      field: 'eventTimeBlocks.1.id',
    },
    {
      name: 'labels equal ignoring case',
      change: (fixture: Fixture) => ({
        eventTimeBlocks: [
          currentGraph(fixture).eventTimeBlocks[0],
          { ...currentGraph(fixture).eventTimeBlocks[1], label: 'WELCOME' },
        ],
      }),
      reason: 'DUPLICATE_EVENT_TIME_BLOCK_LABEL',
      field: 'eventTimeBlocks.1.label',
    },
    {
      name: 'an Event ending at its start',
      change: () => ({ end: at('09:00') }),
      reason: 'INVALID_EVENT_BOUNDS',
      field: 'end',
    },
  ])('refuses $name with a field-aware 422 and writes nothing', async ({
    change,
    reason,
    field,
  }) => {
    const { cycleId, fixture } = await setUp();
    const before = await storedGraph();

    const response = await patchEvent({
      cycleId,
      eventId: fixture.eventId,
      payload: { ...currentGraph(fixture), ...change(fixture) },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      error: 'VALIDATION_ERROR',
      reason,
      field,
    });
    expect(await storedGraph()).toEqual(before);
  });

  it('refuses an empty final collection with LAST_REMAINING_EVENT_TIME_BLOCK', async () => {
    const { cycleId, fixture } = await setUp();
    const before = await storedGraph();

    const response = await patchEvent({
      cycleId,
      eventId: fixture.eventId,
      payload: { ...currentGraph(fixture), eventTimeBlocks: [] },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('LAST_REMAINING_EVENT_TIME_BLOCK');
    expect(await storedGraph()).toEqual(before);
  });

  it('refuses a Church-local start outside the Cycle with EVENT_OUTSIDE_CYCLE', async () => {
    const { cycleId, fixture } = await setUp();
    const before = await storedGraph();
    const graph = currentGraph(fixture);
    // The day before the Cycle; the blocks stay contained.
    const outside = local({ day: '2026-10-11', time: '09:00' });

    const response = await patchEvent({
      cycleId,
      eventId: fixture.eventId,
      payload: { ...graph, start: outside },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('EVENT_OUTSIDE_CYCLE');
    expect(await storedGraph()).toEqual(before);
  });

  it('returns 404 for a block of another Event or Church and writes nothing', async () => {
    const { seed, cycleId, fixture } = await setUp();
    const sibling = await buildEvent({
      db,
      churchId: seed.churchAId,
      cycleId,
      title: 'Sibling',
      start: parseInstant({ value: at('14:00') }),
      end: parseInstant({ value: at('15:00') }),
      status: 'draft',
    });
    const siblingBlock = await buildEventTimeBlock({
      db,
      churchId: seed.churchAId,
      eventId: sibling.id,
      start: parseInstant({ value: at('14:00') }),
      end: parseInstant({ value: at('15:00') }),
      label: 'Sibling',
    });
    const foreignCycle = await seedCycle({ churchId: seed.churchBId });
    const foreign = await seedGeneratedEvent({
      churchId: seed.churchBId,
      cycleId: foreignCycle.id,
    });
    const before = await storedGraph();

    const responses = await Promise.all(
      [siblingBlock.id, foreign.welcome.id].map((id) =>
        patchEvent({
          cycleId,
          eventId: fixture.eventId,
          payload: {
            ...currentGraph(fixture),
            eventTimeBlocks: [
              currentGraph(fixture).eventTimeBlocks[0],
              {
                id,
                label: 'Moved',
                startTime: at('10:00'),
                endTime: at('11:00'),
              },
            ],
          },
        }),
      ),
    );

    expect(responses.map(({ statusCode }) => statusCode)).toEqual([404, 404]);
    expect(await storedGraph()).toEqual(before);
  });

  it('leaves the original graph when a block write fails', async () => {
    const { cycleId, fixture } = await setUp();
    const before = await storedGraph();
    vi.spyOn(
      DrizzlePlanningEventRepository.prototype,
      'createEventTimeBlock',
    ).mockRejectedValue(new Error('block insert failed'));

    const response = await patchEvent({
      cycleId,
      eventId: fixture.eventId,
      payload: {
        ...currentGraph(fixture),
        title: 'Renamed',
        eventTimeBlocks: [
          { ...currentGraph(fixture).eventTimeBlocks[0], label: 'Arrival' },
          { label: 'Extra', startTime: at('11:00'), endTime: at('12:00') },
        ],
      },
    });

    expect(response.statusCode).toBe(500);
    expect(await storedGraph()).toEqual(before);
  });

  it.each([
    'sent',
    'past',
  ] as const)('refuses a Draft Event in a %s Cycle with ILLEGAL_STATE_TRANSITION', async (state) => {
    const seed = await signIn();
    const target = await seedCycle({ churchId: seed.churchAId, state });
    // A Sent Cycle's reopened Event is draft again: still no back door.
    const fixture = await seedGeneratedEvent({
      churchId: seed.churchAId,
      cycleId: target.id,
    });
    const before = await storedGraph();

    const response = await patchEvent({
      cycleId: target.id,
      eventId: fixture.eventId,
      payload: { ...currentGraph(fixture), title: 'Renamed' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('ILLEGAL_STATE_TRANSITION');
    expect(await storedGraph()).toEqual(before);
  });

  it('keeps refusing a standalone delete of the last Time block', async () => {
    const { cycleId, fixture } = await setUp();
    const deleteBlock = (blockId: string) =>
      app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/cycles/${cycleId}/events/${fixture.eventId}/event-time-blocks/${blockId}`,
      });

    expect((await deleteBlock(fixture.service.id)).statusCode).toBe(204);
    const last = await deleteBlock(fixture.welcome.id);

    expect(last.statusCode).toBe(409);
    expect(last.json().error).toBe('LAST_REMAINING_EVENT_TIME_BLOCK');
  });
});

describe('Edit Event access', () => {
  it('returns 401 signed out', async () => {
    const seed = await seedSchedulingPhase3Base();
    const target = await seedCycle({ churchId: seed.churchAId });
    const fixture = await seedGeneratedEvent({
      churchId: seed.churchAId,
      cycleId: target.id,
    });
    mockGetSession.mockResolvedValue(null as never);

    const response = await patchEvent({
      cycleId: target.id,
      eventId: fixture.eventId,
      payload: currentGraph(fixture),
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 403 to a member without the ChurchAdmin capability', async () => {
    const seed = await signIn({ persona: 'member' });
    const target = await seedCycle({ churchId: seed.churchAId });
    const fixture = await seedGeneratedEvent({
      churchId: seed.churchAId,
      cycleId: target.id,
    });

    const response = await patchEvent({
      cycleId: target.id,
      eventId: fixture.eventId,
      payload: currentGraph(fixture),
    });

    expect(response.statusCode).toBe(403);
  });

  it('returns the same 404 for an Event of another Cycle or Church', async () => {
    const { seed, fixture } = await setUp();
    const otherCycle = await buildCycle({
      db,
      churchId: seed.churchAId,
      name: 'November',
      state: 'draft',
      startDate: parseCalendarDay({ value: '2026-11-01' }),
      endDate: parseCalendarDay({ value: '2026-11-14' }),
    });
    const foreignCycle = await seedCycle({ churchId: seed.churchBId });
    const foreign = await seedGeneratedEvent({
      churchId: seed.churchBId,
      cycleId: foreignCycle.id,
    });
    const before = await storedGraph();

    const wrongCycle = await patchEvent({
      cycleId: otherCycle.id,
      eventId: fixture.eventId,
      payload: currentGraph(fixture),
    });
    const otherChurch = await patchEvent({
      cycleId: foreignCycle.id,
      eventId: foreign.eventId,
      payload: currentGraph(foreign),
    });

    expect(wrongCycle.statusCode).toBe(404);
    expect(otherChurch.statusCode).toBe(404);
    expect(await storedGraph()).toEqual(before);
  });
});
