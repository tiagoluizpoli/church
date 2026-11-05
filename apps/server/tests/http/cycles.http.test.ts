import { randomUUID } from 'node:crypto';
import {
  cycle,
  event,
  eventTemplate,
  eventTimeBlock,
  ministry,
  ministryParticipation,
  outboxMessage,
} from '@church/db';
import { getIntegrationDatabaseUrl } from '@church/db/integration-database-url';
import { m } from '@church/i18n/messages';
import {
  fromDateColumn,
  parseCalendarDay,
  parseInstant,
  parseTimeOfDay,
  resetClock,
  setTestClock,
} from '@church/time';
import { eq } from 'drizzle-orm';
import pg from 'pg';
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
import { OverlappingCycleError } from '@/domain/errors/overlapping-cycle';
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
  buildMinistryParticipation,
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
const cycleRepository = new DrizzleCycleRepository({ db });

/** Church A is America/Sao_Paulo (UTC-3, no DST). */
const CHURCH_OCTOBER_1_NOON = '2026-10-01T15:00:00.000Z';
const MAX_NAME_LENGTH = 255;

let app: FastifyTypedInstance;

beforeAll(async () => {
  const churchRepository = new DrizzleChurchRepository({ db });
  const eventRepository = new DrizzlePlanningEventRepository({ db });
  const unitOfWork = new DrizzleUnitOfWork({ db });
  const participationRepository = new DrizzleMinistryParticipationRepository({
    db,
  });
  const templateRepository = new DrizzleEventTemplateRepository({ db });
  const staffingSeeder = new UsualSetupStaffingSeeder({
    participationRepository,
    shiftRepository: new DrizzleShiftRepository({ db }),
    usualSetupRepository: new DrizzleUsualSetupRepository({ db }),
    ministryRepository: new DrizzleMinistryRepository({ db }),
  });
  app = await createFastify({ locale: testLocale });
  // Real managers, repositories and AuthorityService decision; only the
  // session, the Active Church selection and the actor lookup are seams.
  const controller = new ChurchAdminController({
    cycleManager: new DbCycleManager({
      cycleRepository,
      eventRepository,
      churchRepository,
      unitOfWork,
      participationRepository,
      staffingSeeder,
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

afterEach(() => resetClock());

type Persona = 'admin' | 'member' | 'leader';

interface SignInInput {
  persona?: Persona;
}

/** A signed-in actor of Church A; a ChurchAdmin has no Volunteer profile. */
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

interface CycleBody {
  name?: string;
  startDate: string;
  endDate: string;
}

interface PostCycleInput {
  payload: unknown;
  locale?: 'en' | 'pt-BR';
}

function postCycle({ payload, locale }: PostCycleInput) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/admin/cycles',
    payload: payload as never,
    cookies: locale ? { [testLocale.localeCookieName]: locale } : {},
  });
}

function createCycle({ name = 'October', ...dates }: CycleBody) {
  return postCycle({ payload: { name, ...dates } });
}

interface SeedCycleInput {
  churchId: string;
  name?: string;
  startDate: string;
  endDate: string;
  state?: 'draft' | 'sent' | 'past';
}

function seedCycle({
  name = 'Seeded',
  state = 'draft',
  ...input
}: SeedCycleInput) {
  return buildCycle({
    db,
    name,
    state,
    ...input,
    startDate: parseCalendarDay({ value: input.startDate }),
    endDate: parseCalendarDay({ value: input.endDate }),
  });
}

async function storedRanges() {
  const rows = await db
    .select()
    .from(cycle)
    .orderBy(cycle.startDate, cycle.churchId);
  return rows.map((row) => ({
    churchId: row.churchId,
    startDate: fromDateColumn({ date: row.startDate }),
    endDate: fromDateColumn({ date: row.endDate }),
  }));
}

describe('POST /admin/cycles', () => {
  it('creates a one-day Draft whose single day is its first and last', async () => {
    const seed = await signIn();

    const response = await createCycle({
      name: 'Retreat',
      startDate: '2026-10-25',
      endDate: '2026-10-25',
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      name: 'Retreat',
      startDate: '2026-10-25',
      endDate: '2026-10-25',
      state: 'draft',
    });
    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/cycles/${response.json().id}`,
    });
    expect(detail.json().cycle).toMatchObject({
      churchId: seed.churchAId,
      startDate: '2026-10-25',
      endDate: '2026-10-25',
      state: 'draft',
    });
  });

  it('refuses reversed dates with a localized INVALID_DATE_RANGE', async () => {
    await signIn();
    const reversed = {
      name: 'Backwards',
      startDate: '2026-10-26',
      endDate: '2026-10-25',
    };

    const ptBr = await postCycle({ payload: reversed });
    const en = await postCycle({ payload: reversed, locale: 'en' });

    expect(ptBr.statusCode).toBe(400);
    expect(ptBr.json()).toEqual({
      error: 'INVALID_DATE_RANGE',
      message: m.error_invalid_date_range({}, { locale: 'pt-BR' }),
    });
    expect(en.json().message).toBe(
      m.error_invalid_date_range({}, { locale: 'en' }),
    );
    expect(m.error_invalid_date_range({}, { locale: 'en' })).toBe(
      "The end date can't be before the start date.",
    );
    expect(await storedRanges()).toEqual([]);
  });

  it.each([
    [
      'a malformed date',
      { name: 'October', startDate: '2026-02-30', endDate: '2026-03-01' },
    ],
    [
      'a blank name',
      { name: '   ', startDate: '2026-10-01', endDate: '2026-10-02' },
    ],
    [
      'an oversized name',
      {
        name: 'x'.repeat(MAX_NAME_LENGTH + 1),
        startDate: '2026-10-01',
        endDate: '2026-10-02',
      },
    ],
  ])('refuses %s with 422 VALIDATION_ERROR', async (_case, payload) => {
    await signIn();

    const response = await postCycle({ payload });

    expect(response.statusCode).toBe(422);
    expect(response.json().error).toBe('VALIDATION_ERROR');
    expect(await storedRanges()).toEqual([]);
  });

  it('trims the name and accepts one of exactly the maximum length', async () => {
    await signIn();
    const longest = 'x'.repeat(MAX_NAME_LENGTH);

    const trimmed = await createCycle({
      name: '  October  ',
      startDate: '2026-10-01',
      endDate: '2026-10-02',
    });
    const maximal = await createCycle({
      name: longest,
      startDate: '2026-10-03',
      endDate: '2026-10-04',
    });

    expect(trimmed.json().name).toBe('October');
    expect(maximal.json().name).toBe(longest);
  });

  it('refuses a shared endpoint, naming the conflicting Cycle in the Active Church only', async () => {
    const seed = await signIn();
    const existing = await seedCycle({
      churchId: seed.churchAId,
      name: 'Early October',
      startDate: '2026-10-12',
      endDate: '2026-10-25',
    });
    await seedCycle({
      churchId: seed.churchBId,
      name: 'Foreign',
      startDate: '2026-10-20',
      endDate: '2026-10-31',
    });

    const response = await postCycle({
      payload: { name: 'Late', startDate: '2026-10-25', endDate: '2026-10-31' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'OVERLAPPING_CYCLE',
      message: m.error_overlapping_cycle({}, { locale: 'pt-BR' }),
      conflictingCycles: [
        {
          id: existing.id,
          name: 'Early October',
          startDate: '2026-10-12',
          endDate: '2026-10-25',
        },
      ],
    });
  });

  it('accepts the next day, a gap and the same dates as another Church', async () => {
    const seed = await signIn();
    await seedCycle({
      churchId: seed.churchAId,
      startDate: '2026-10-12',
      endDate: '2026-10-25',
    });
    await seedCycle({
      churchId: seed.churchBId,
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    });

    const adjacent = await createCycle({
      startDate: '2026-10-26',
      endDate: '2026-10-31',
    });
    const afterGap = await createCycle({
      startDate: '2026-11-05',
      endDate: '2026-11-30',
    });

    expect(adjacent.statusCode).toBe(201);
    expect(afterGap.statusCode).toBe(201);
  });

  it('lets only one of two concurrent overlapping creates commit', async () => {
    await signIn();

    const responses = await Promise.all([
      createCycle({ startDate: '2026-10-10', endDate: '2026-10-20' }),
      createCycle({ startDate: '2026-10-20', endDate: '2026-10-30' }),
    ]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      201, 409,
    ]);
    const winner = responses.find((response) => response.statusCode === 201);
    const loser = responses.find((response) => response.statusCode === 409);
    expect(loser?.json().conflictingCycles).toEqual([
      expect.objectContaining({ id: winner?.json().id }),
    ]);
    expect(await storedRanges()).toHaveLength(1);
  });

  it('translates a database exclusion race into the same scoped refusal', async () => {
    const seed = await signIn();
    const existing = await seedCycle({
      churchId: seed.churchAId,
      name: 'Committed first',
      startDate: '2026-10-12',
      endDate: '2026-10-25',
    });

    // The repository alone skips the manager's lock and pre-check, as a racing
    // writer that read before the other committed would.
    const insert = cycleRepository.create({
      churchId: ChurchId.from(seed.churchAId),
      name: 'Racer',
      startDate: new Date('2026-10-25T00:00:00.000Z'),
      endDate: new Date('2026-10-26T00:00:00.000Z'),
    });

    await expect(insert).rejects.toBeInstanceOf(OverlappingCycleError);
    await expect(insert).rejects.toMatchObject({
      conflictingCycles: [
        {
          id: existing.id,
          name: 'Committed first',
          startDate: '2026-10-12',
          endDate: '2026-10-25',
        },
      ],
    });
  });
});

describe('Cycle access', () => {
  it('returns 401 when signed out', async () => {
    mockGetSession.mockResolvedValue(null as never);

    const response = await createCycle({
      startDate: '2026-10-01',
      endDate: '2026-10-01',
    });

    expect(response.statusCode).toBe(401);
  });

  it.each([
    'member',
    'leader',
  ] as const)('returns 403 to a %s without the ChurchAdmin capability', async (persona) => {
    await signIn({ persona });

    const response = await createCycle({
      startDate: '2026-10-01',
      endDate: '2026-10-01',
    });

    expect(response.statusCode).toBe(403);
    expect(await storedRanges()).toEqual([]);
  });

  it('returns the same scoped 404 for a missing and a foreign Cycle', async () => {
    const seed = await signIn();
    const foreign = await seedCycle({
      churchId: seed.churchBId,
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    });

    for (const cycleId of [randomUUID(), foreign.id]) {
      const detail = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/cycles/${cycleId}`,
      });
      const apply = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/cycles/${cycleId}/apply-templates`,
        payload: { templateIds: [randomUUID()] },
      });

      expect(detail.statusCode).toBe(404);
      expect(apply.statusCode).toBe(404);
      expect(detail.json().error).toBe('NOT_FOUND');
    }
  });
});

describe('GET /admin/cycles/:cycleId', () => {
  const at = (value: string) => parseInstant({ value });

  async function seedReviewCycle(input: {
    churchId: string;
    state?: 'draft' | 'sent' | 'past';
  }) {
    return seedCycle({
      ...input,
      startDate: '2026-10-12',
      endDate: '2026-10-25',
    });
  }

  it('returns every Event in start order with deterministic ties, its location and every time block', async () => {
    const seed = await signIn();
    const reviewCycle = await seedReviewCycle({ churchId: seed.churchAId });
    const base = { db, churchId: seed.churchAId, cycleId: reviewCycle.id };
    // Same start: the earlier end, then the title, decide the order.
    const longer = await buildEvent({
      ...base,
      title: 'Retreat',
      start: at('2026-10-17T12:00:00.000Z'),
      end: at('2026-10-19T20:00:00.000Z'),
      status: 'scheduled',
    });
    const shorter = await buildEvent({
      ...base,
      title: 'Prayer',
      start: at('2026-10-17T12:00:00.000Z'),
      end: at('2026-10-17T14:00:00.000Z'),
      status: 'scheduled',
    });
    const earlier = await buildEvent({
      ...base,
      title: 'Vigil',
      start: at('2026-10-14T22:00:00.000Z'),
      end: at('2026-10-15T04:00:00.000Z'),
      status: 'scheduled',
    });
    await db
      .update(event)
      .set({ location: 'Main hall' })
      .where(eq(event.id, earlier.id));
    // Inserted out of order; the overnight block ends the next Church day.
    await buildEventTimeBlock({
      ...base,
      eventId: earlier.id,
      label: 'Watch',
      start: at('2026-10-15T01:00:00.000Z'),
      end: at('2026-10-15T04:00:00.000Z'),
    });
    await buildEventTimeBlock({
      ...base,
      eventId: earlier.id,
      label: 'Opening',
      start: at('2026-10-14T22:00:00.000Z'),
      end: at('2026-10-15T00:00:00.000Z'),
    });
    const foreign = await seedReviewCycle({ churchId: seed.churchBId });
    await buildEvent({
      db,
      churchId: seed.churchBId,
      cycleId: foreign.id,
      title: 'Foreign',
      start: at('2026-10-14T22:00:00.000Z'),
      end: at('2026-10-14T23:00:00.000Z'),
      status: 'scheduled',
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/cycles/${reviewCycle.id}`,
    });

    expect(response.statusCode).toBe(200);
    const { cycle: detail, events } = response.json();
    expect(detail).toMatchObject({
      id: reviewCycle.id,
      startDate: '2026-10-12',
      endDate: '2026-10-25',
    });
    expect(
      events.map((group: { event: { id: string } }) => group.event.id),
    ).toEqual([earlier.id, shorter.id, longer.id]);
    expect(events[0].event.location).toBe('Main hall');
    expect(
      events[0].eventTimeBlocks.map(
        (block: { label: string; startTime: string; endTime: string }) => [
          block.label,
          block.startTime,
          block.endTime,
        ],
      ),
    ).toEqual([
      ['Opening', '2026-10-14T22:00:00.000Z', '2026-10-15T00:00:00.000Z'],
      ['Watch', '2026-10-15T01:00:00.000Z', '2026-10-15T04:00:00.000Z'],
    ]);
  });

  it.each([
    'sent',
    'past',
  ] as const)('returns a stored %s Cycle with its complete graph', async (state) => {
    const seed = await signIn();
    const stored = await seedReviewCycle({ churchId: seed.churchAId, state });
    await buildEvent({
      db,
      churchId: seed.churchAId,
      cycleId: stored.id,
      title: 'Service',
      start: at('2026-10-18T22:00:00.000Z'),
      end: at('2026-10-19T00:00:00.000Z'),
      status: 'scheduled',
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/cycles/${stored.id}`,
    });

    expect(response.json().cycle.state).toBe(state);
    expect(response.json().events).toHaveLength(1);
  });

  it('refuses a signed-out request and a member without the ChurchAdmin capability', async () => {
    const seed = await signIn({ persona: 'member' });
    const stored = await seedReviewCycle({ churchId: seed.churchAId });
    const url = `/api/v1/admin/cycles/${stored.id}`;

    const forbidden = await app.inject({ method: 'GET', url });
    mockGetSession.mockResolvedValue(null as never);
    const signedOut = await app.inject({ method: 'GET', url });

    expect(forbidden.statusCode).toBe(403);
    expect(signedOut.statusCode).toBe(401);
  });
});

const LOCK_WAIT_DEADLINE_MS = 5000;
const LOCK_WAIT_POLL_MS = 20;

async function waitForChurchLockWaiter(holder: pg.Client) {
  const deadline = Date.now() + LOCK_WAIT_DEADLINE_MS;
  while (Date.now() < deadline) {
    // The holder is inside a transaction, which would otherwise see one frozen activity snapshot.
    await holder.query('SELECT pg_stat_clear_snapshot()');
    const { rows } = await holder.query(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock'
         AND query ILIKE '%pg_advisory_xact_lock%'`,
    );
    if (rows[0].waiting >= 1) return;
    await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_POLL_MS));
  }
  throw new Error('no request reached the Church lock');
}

describe('Cycle last day', () => {
  const time = (value: string) => parseTimeOfDay({ value });

  async function seedSundayTemplate(churchId: string) {
    const { template } = await buildEventTemplate({
      db,
      churchId,
      name: 'Sunday',
      weekday: 0,
      blocks: [
        { label: 'Service', startTime: time('19:00'), endTime: time('21:00') },
      ],
    });
    return template;
  }

  function applyTemplates(cycleId: string, templateId: string) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/admin/cycles/${cycleId}/apply-templates`,
      payload: { templateIds: [templateId] },
    });
  }

  async function eventStarts(cycleId: string) {
    const rows = await db
      .select()
      .from(event)
      .where(eq(event.cycleId, cycleId))
      .orderBy(event.start);
    return rows.map((row) => row.start.toISOString());
  }

  it('generates matching Events on the last day and on a one-day Cycle', async () => {
    const seed = await signIn();
    const template = await seedSundayTemplate(seed.churchAId);
    // Monday 12 – Sunday 25 October.
    const fortnight = await seedCycle({
      churchId: seed.churchAId,
      startDate: '2026-10-12',
      endDate: '2026-10-25',
    });
    const oneDay = await seedCycle({
      churchId: seed.churchAId,
      startDate: '2026-11-01',
      endDate: '2026-11-01',
    });

    const fortnightApply = await applyTemplates(fortnight.id, template.id);
    const oneDayApply = await applyTemplates(oneDay.id, template.id);

    expect(fortnightApply.json()).toEqual({
      generatedEventCount: 2,
      generatedEventTimeBlockCount: 2,
    });
    expect(await eventStarts(fortnight.id)).toEqual([
      '2026-10-18T22:00:00.000Z',
      '2026-10-25T22:00:00.000Z',
    ]);
    expect(oneDayApply.json().generatedEventCount).toBe(1);
  });

  it('makes Apply wait on the Church lock and read what its holder committed', async () => {
    const seed = await signIn();
    const template = await seedSundayTemplate(seed.churchAId);
    const fortnight = await seedCycle({
      churchId: seed.churchAId,
      startDate: '2026-10-12',
      endDate: '2026-10-25',
    });
    const holder = new pg.Client({
      connectionString: getIntegrationDatabaseUrl(),
    });
    await holder.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        seed.churchAId,
      ]);
      // inject() dispatches only once awaited; start the request now.
      const pending = applyTemplates(fortnight.id, template.id).then(
        (response) => response,
      );
      await waitForChurchLockWaiter(holder);
      // A concurrent writer's occurrence on the 18th, committed while Apply waits.
      await holder.query(
        `INSERT INTO event (church_id, cycle_id, source_template_id, title, start, "end")
         VALUES ($1, $2, $3, 'Sunday', '2026-10-18T22:00:00Z', '2026-10-19T00:00:00Z')`,
        [seed.churchAId, fortnight.id, template.id],
      );
      await holder.query('COMMIT');

      const response = await pending;

      expect(response.json().generatedEventCount).toBe(1);
      expect(await eventStarts(fortnight.id)).toEqual([
        '2026-10-18T22:00:00.000Z',
        '2026-10-25T22:00:00.000Z',
      ]);
    } finally {
      await holder.end();
    }
  });

  describe('while UTC is already the next day', () => {
    // 23:30 on Sunday 25 October in São Paulo is 02:30 on the 26th in UTC.
    const CHURCH_LAST_EVENING = '2026-10-26T02:30:00.000Z';
    // 00:30 on Monday 26 October in São Paulo.
    const CHURCH_NEXT_DAY = '2026-10-26T03:30:00.000Z';

    function createEvent(cycleId: string, start: string, end: string) {
      return app.inject({
        method: 'POST',
        url: `/api/v1/admin/cycles/${cycleId}/events`,
        payload: { title: 'Vigil', start, end },
      });
    }

    it('keeps the Cycle current and writable through its final Church day', async () => {
      const seed = await signIn();
      const fortnight = await seedCycle({
        churchId: seed.churchAId,
        startDate: '2026-10-12',
        endDate: '2026-10-25',
      });
      setTestClock({ instant: parseInstant({ value: CHURCH_LAST_EVENING }) });

      const detail = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/cycles/${fortnight.id}`,
      });
      // Starts 23:45 on the last Church day and spills into the next day.
      const spillover = await createEvent(
        fortnight.id,
        '2026-10-26T02:45:00.000Z',
        '2026-10-26T05:00:00.000Z',
      );
      const nextDayStart = await createEvent(
        fortnight.id,
        CHURCH_NEXT_DAY,
        '2026-10-26T05:00:00.000Z',
      );

      expect(detail.json().cycle.state).toBe('draft');
      expect(spillover.statusCode).toBe(201);
      expect(nextDayStart.statusCode).toBe(409);
      expect(nextDayStart.json()).toEqual({
        error: 'EVENT_OUTSIDE_CYCLE',
        message: m.error_event_outside_cycle({}, { locale: 'pt-BR' }),
      });
    });

    it('becomes Past on the next Church day, found by the Past filter and closed to writes', async () => {
      const seed = await signIn();
      const fortnight = await seedCycle({
        churchId: seed.churchAId,
        startDate: '2026-10-12',
        endDate: '2026-10-25',
      });
      setTestClock({ instant: parseInstant({ value: CHURCH_NEXT_DAY }) });

      const past = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/cycles?state=past',
      });
      const drafts = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/cycles?state=draft',
      });
      const write = await createEvent(
        fortnight.id,
        '2026-10-25T22:00:00.000Z',
        '2026-10-25T23:00:00.000Z',
      );

      expect(past.json().cycles).toEqual([
        expect.objectContaining({ id: fortnight.id, state: 'past' }),
      ]);
      expect(drafts.json().cycles).toEqual([]);
      expect(write.statusCode).toBe(409);
      expect(write.json().error).toBe('ILLEGAL_STATE_TRANSITION');
    });
  });
});

describe('DELETE /admin/cycles/:cycleId', () => {
  const DELETE_START = parseInstant({ value: '2026-10-18T22:00:00Z' });
  const DELETE_END = parseInstant({ value: '2026-10-19T00:00:00Z' });

  function deleteCycle(cycleId: string) {
    return app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/cycles/${cycleId}`,
    });
  }

  interface SeedGraphInput {
    churchId: string;
    ministryId: string;
    cycleId: string;
    eventStatus?: 'draft' | 'scheduled' | 'cancelled';
  }

  async function seedGraph({
    churchId,
    ministryId,
    cycleId,
    eventStatus = 'draft',
  }: SeedGraphInput) {
    const seededEvent = await buildEvent({
      db,
      churchId,
      cycleId,
      title: 'Sunday',
      start: DELETE_START,
      end: DELETE_END,
      status: eventStatus,
    });
    const block = await buildEventTimeBlock({
      db,
      churchId,
      eventId: seededEvent.id,
      start: DELETE_START,
      end: DELETE_END,
    });
    await buildMinistryParticipation({
      db,
      churchId,
      ministryId,
      eventId: seededEvent.id,
      state: 'preparing',
      eventTimeBlockIds: [block.id],
    });
    return seededEvent;
  }

  async function graphCounts() {
    const [cycles, events, blocks, participations, outbox] = await Promise.all([
      db.select().from(cycle),
      db.select().from(event),
      db.select().from(eventTimeBlock),
      db.select().from(ministryParticipation),
      db.select().from(outboxMessage),
    ]);
    return {
      cycles: cycles.length,
      events: events.length,
      blocks: blocks.length,
      participations: participations.length,
      outbox: outbox.length,
    };
  }

  it('hard-deletes a Draft with its owned graph, keeping templates, Ministries and other Cycles', async () => {
    const seed = await signIn();
    const template = await buildEventTemplate({
      db,
      churchId: seed.churchAId,
      name: 'Sunday',
      weekday: 0,
      blocks: [],
    });
    const doomed = await seedCycle({
      churchId: seed.churchAId,
      startDate: '2026-10-12',
      endDate: '2026-10-25',
    });
    const kept = await seedCycle({
      churchId: seed.churchAId,
      startDate: '2026-11-01',
      endDate: '2026-11-07',
    });
    // A retained legacy cancelled Event is removed with the rest.
    await seedGraph({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      cycleId: doomed.id,
    });
    await seedGraph({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      cycleId: doomed.id,
      eventStatus: 'cancelled',
    });
    const survivor = await seedGraph({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      cycleId: kept.id,
    });

    const response = await deleteCycle(doomed.id);

    expect(response.statusCode).toBe(204);
    expect(await graphCounts()).toEqual({
      cycles: 1,
      events: 1,
      blocks: 1,
      participations: 1,
      outbox: 0,
    });
    expect((await db.select().from(event))[0]?.id).toBe(survivor.id);
    expect((await db.select().from(eventTemplate)).map((t) => t.id)).toContain(
      template.template.id,
    );
    expect(await db.select().from(ministry)).not.toHaveLength(0);
    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/cycles/${doomed.id}`,
    });
    expect(detail.statusCode).toBe(404);
  });

  it.each([
    'sent',
    'past',
  ] as const)('refuses a %s Cycle with ILLEGAL_STATE_TRANSITION and keeps its graph', async (state) => {
    const seed = await signIn();
    const target = await seedCycle({
      churchId: seed.churchAId,
      startDate: '2026-10-12',
      endDate: '2026-10-25',
      state,
    });
    await seedGraph({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      cycleId: target.id,
    });
    const before = await graphCounts();

    const response = await deleteCycle(target.id);

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('ILLEGAL_STATE_TRANSITION');
    expect(await graphCounts()).toEqual(before);
  });

  it('refuses a Draft whose last day already elapsed in the Church', async () => {
    const seed = await signIn();
    const elapsed = await seedCycle({
      churchId: seed.churchAId,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });
    await seedGraph({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      cycleId: elapsed.id,
    });

    const response = await deleteCycle(elapsed.id);

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('ILLEGAL_STATE_TRANSITION');
    expect((await graphCounts()).events).toBe(1);
  });

  it('returns 401 signed out and 403 without the ChurchAdmin capability, deleting nothing', async () => {
    mockGetSession.mockResolvedValue(null as never);
    const signedOut = await deleteCycle(randomUUID());
    expect(signedOut.statusCode).toBe(401);

    for (const persona of ['member', 'leader'] as const) {
      const seed = await signIn({ persona });
      const target = await seedCycle({
        churchId: seed.churchAId,
        startDate: '2026-10-12',
        endDate: '2026-10-25',
      });

      const response = await deleteCycle(target.id);

      expect(response.statusCode).toBe(403);
      expect((await graphCounts()).cycles).toBe(1);
      await resetSchedulingPhase3Db();
    }
  });

  it('returns the same 404 for a missing and a foreign Cycle, deleting nothing', async () => {
    const seed = await signIn();
    const foreign = await seedCycle({
      churchId: seed.churchBId,
      startDate: '2026-10-12',
      endDate: '2026-10-25',
    });

    for (const cycleId of [randomUUID(), foreign.id]) {
      const response = await deleteCycle(cycleId);
      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe('NOT_FOUND');
    }
    expect((await graphCounts()).cycles).toBe(1);
  });

  it('rolls the whole graph back when the transaction fails', async () => {
    const seed = await signIn();
    const target = await seedCycle({
      churchId: seed.churchAId,
      startDate: '2026-10-12',
      endDate: '2026-10-25',
    });
    await seedGraph({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      cycleId: target.id,
    });
    const before = await graphCounts();
    const failure = new Error('commit failed');
    const spy = vi
      .spyOn(DrizzleCycleRepository.prototype, 'delete')
      .mockImplementationOnce(async (input) => {
        // Run the real delete, then fail so the transaction must roll back.
        spy.mockRestore();
        await cycleRepository.delete(input);
        throw failure;
      });

    const response = await deleteCycle(target.id);

    expect(response.statusCode).toBe(500);
    expect(await graphCounts()).toEqual(before);
  });

  describe('against concurrent writers', () => {
    async function holdChurchLock(churchId: string) {
      const holder = new pg.Client({
        connectionString: getIntegrationDatabaseUrl(),
      });
      await holder.connect();
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        churchId,
      ]);
      return holder;
    }

    it('deletes an Event inserted by a writer that held the lock first', async () => {
      const seed = await signIn();
      const target = await seedCycle({
        churchId: seed.churchAId,
        startDate: '2026-10-12',
        endDate: '2026-10-25',
      });
      const holder = await holdChurchLock(seed.churchAId);
      try {
        const pending = deleteCycle(target.id).then((response) => response);
        await waitForChurchLockWaiter(holder);
        await holder.query(
          `INSERT INTO event (church_id, cycle_id, title, start, "end")
           VALUES ($1, $2, 'Late', '2026-10-18T22:00:00Z', '2026-10-19T00:00:00Z')`,
          [seed.churchAId, target.id],
        );
        await holder.query('COMMIT');

        const response = await pending;

        expect(response.statusCode).toBe(204);
        expect(await graphCounts()).toMatchObject({ cycles: 0, events: 0 });
      } finally {
        await holder.end();
      }
    });

    it('refuses with 409 when a Send committed first, keeping the graph', async () => {
      const seed = await signIn();
      const target = await seedCycle({
        churchId: seed.churchAId,
        startDate: '2026-10-12',
        endDate: '2026-10-25',
      });
      await seedGraph({
        churchId: seed.churchAId,
        ministryId: seed.ministryAId,
        cycleId: target.id,
      });
      const holder = await holdChurchLock(seed.churchAId);
      try {
        const pending = deleteCycle(target.id).then((response) => response);
        await waitForChurchLockWaiter(holder);
        await holder.query(`UPDATE cycle SET state = 'sent' WHERE id = $1`, [
          target.id,
        ]);
        await holder.query('COMMIT');

        const response = await pending;

        expect(response.statusCode).toBe(409);
        expect(response.json().error).toBe('ILLEGAL_STATE_TRANSITION');
        expect((await graphCounts()).events).toBe(1);
      } finally {
        await holder.end();
      }
    });
  });
});
