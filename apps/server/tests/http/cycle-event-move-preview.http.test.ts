import {
  assignment,
  assignmentAudit,
  event,
  eventTimeBlock,
  outboxMessage,
  shift,
  swapRequest,
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
import { buildUser } from '@/seeds/builders/identity';
import { buildRole } from '@/seeds/builders/ministry';
import {
  buildAssignedShift,
  buildCycle,
  buildEvent,
  buildEventTimeBlock,
  buildMinistryParticipation,
} from '@/seeds/builders/scheduling';
import { buildVolunteer } from '@/seeds/builders/volunteer';
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

/** Sunday 2026-10-18 in São Paulo. */
const at = (time: string) => local({ day: '2026-10-18', time });
const inst = (value: string) => parseInstant({ value });

interface PreviewInput {
  cycleId: string;
  eventId: string;
  start: unknown;
  locale?: 'en' | 'pt-BR';
}

function preview({ cycleId, eventId, start, locale }: PreviewInput) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/admin/cycles/${cycleId}/events/${eventId}/move/preview`,
    payload: { start } as never,
    cookies: locale ? { [testLocale.localeCookieName]: locale } : {},
  });
}

/** Every table a preview must leave untouched. */
async function writeSnapshot() {
  const [events, blocks, shifts, assignments, audits, swaps, outbox] =
    await Promise.all([
      db.select().from(event),
      db.select().from(eventTimeBlock),
      db.select().from(shift),
      db.select().from(assignment),
      db.select().from(assignmentAudit),
      db.select().from(swapRequest),
      db.select().from(outboxMessage),
    ]);
  return { events, blocks, shifts, assignments, audits, swaps, outbox };
}

interface SeedScheduledEventInput {
  churchId: string;
  cycleId: string;
  title?: string;
  start?: string;
  end?: string;
  status?: 'draft' | 'scheduled';
}

/** A scheduled Event with Welcome (start, +1h) and Service (+1h, end) blocks. */
async function seedScheduledEvent({
  churchId,
  cycleId,
  title = 'Sunday',
  start = at('09:00'),
  end = at('12:00'),
  status = 'scheduled',
}: SeedScheduledEventInput) {
  const row = await buildEvent({
    db,
    churchId,
    cycleId,
    title,
    start: inst(start),
    end: inst(end),
    status,
  });
  const welcomeEnd = new Date(Date.parse(start) + 3_600_000).toISOString();
  const welcome = await buildEventTimeBlock({
    db,
    churchId,
    eventId: row.id,
    start: inst(start),
    end: inst(welcomeEnd),
    label: 'Welcome',
  });
  const service = await buildEventTimeBlock({
    db,
    churchId,
    eventId: row.id,
    start: inst(welcomeEnd),
    end: inst(end),
    label: 'Service',
  });
  return { event: row, welcome, service };
}

interface SeedVolunteerInput {
  churchId: string;
  name: string;
}

async function seedVolunteer({ churchId, name }: SeedVolunteerInput) {
  const user = await buildUser({
    db,
    id: `user-${name}`,
    name,
    email: `${name}@test.com`,
  });
  return buildVolunteer({ db, churchId, userId: user.id });
}

interface BookInput {
  churchId: string;
  eventId: string;
  participationId: string;
  roleId: string;
  volunteerId: string;
  start: string;
  end: string;
  status: 'draft' | 'pending' | 'confirmed' | 'declined' | 'cancelled';
}

function book({ start, end, ...rest }: BookInput) {
  return buildAssignedShift({
    db,
    ...rest,
    start: inst(start),
    end: inst(end),
  });
}

describe('POST /admin/cycles/:cycleId/events/:eventId/move/preview', () => {
  it('proposes the moved bounds, keeping durations and shifting every block, and writes nothing', async () => {
    const seed = await signIn();
    const cycle = await seedCycle({ churchId: seed.churchAId, state: 'sent' });
    const {
      event: sunday,
      welcome,
      service,
    } = await seedScheduledEvent({
      churchId: seed.churchAId,
      cycleId: cycle.id,
    });
    const before = await writeSnapshot();

    const response = await preview({
      cycleId: cycle.id,
      eventId: sunday.id,
      start: local({ day: '2026-10-20', time: '14:00' }),
    });

    expect(response.statusCode).toBe(200);
    const toDay = (time: string) => local({ day: '2026-10-20', time });
    expect(response.json()).toEqual({
      event: {
        previous: { start: at('09:00'), end: at('12:00') },
        proposed: { start: toDay('14:00'), end: toDay('17:00') },
      },
      eventTimeBlocks: [
        {
          id: welcome.id,
          label: 'Welcome',
          moved: true,
          previous: { start: at('09:00'), end: at('10:00') },
          proposed: { start: toDay('14:00'), end: toDay('15:00') },
        },
        {
          id: service.id,
          label: 'Service',
          moved: true,
          previous: { start: at('10:00'), end: at('12:00') },
          proposed: { start: toDay('15:00'), end: toDay('17:00') },
        },
      ],
      clashes: [],
    });
    expect(await writeSnapshot()).toEqual(before);
  });

  it('lists a typed clash row per active clashing Assignment and spares everything else', async () => {
    const seed = await signIn();
    const churchId = seed.churchAId;
    const cycle = await seedCycle({ churchId, state: 'sent' });
    const moving = await seedScheduledEvent({ churchId, cycleId: cycle.id });
    const other = await seedScheduledEvent({
      churchId,
      cycleId: cycle.id,
      title: 'Other',
      start: local({ day: '2026-10-20', time: '08:00' }),
      end: local({ day: '2026-10-20', time: '20:00' }),
    });
    const role = await buildRole({
      db,
      churchId,
      ministryId: seed.ministryAId,
      name: 'Usher',
    });
    const participation = await buildMinistryParticipation({
      db,
      churchId,
      ministryId: seed.ministryAId,
      eventId: moving.event.id,
      state: 'preparing',
      eventTimeBlockIds: [],
    });
    const otherParticipation = await buildMinistryParticipation({
      db,
      churchId,
      ministryId: seed.ministryAId,
      eventId: other.event.id,
      state: 'preparing',
      eventTimeBlockIds: [],
    });
    const names = [
      'draft',
      'pending',
      'confirmed',
      'declined',
      'touching',
      'selfshift',
    ];
    const people = Object.fromEntries(
      await Promise.all(
        names.map(async (name) => [
          name,
          await seedVolunteer({ churchId, name }),
        ]),
      ),
    );

    const target = local({ day: '2026-10-20', time: '14:00' });
    const moved = { start: at('09:00'), end: at('10:00') };
    const day20 = (time: string) => local({ day: '2026-10-20', time });
    // Each Volunteer serves the moving Event 09–10 (→ 14–15 after the move).
    for (const name of names) {
      await book({
        churchId,
        eventId: moving.event.id,
        participationId: participation.id,
        roleId: role.id,
        volunteerId: people[name]?.id as string,
        status: 'confirmed',
        ...moved,
      });
    }
    // Elsewhere: active statuses overlap 14:30–15:30; others do not clash.
    const elsewhere = { start: day20('14:30'), end: day20('15:30') };
    for (const name of ['draft', 'pending', 'confirmed'] as const) {
      await book({
        churchId,
        eventId: other.event.id,
        participationId: otherParticipation.id,
        roleId: role.id,
        volunteerId: people[name]?.id as string,
        status: name,
        ...elsewhere,
      });
    }
    await book({
      churchId,
      eventId: other.event.id,
      participationId: otherParticipation.id,
      roleId: role.id,
      volunteerId: people.declined?.id as string,
      status: 'declined',
      ...elsewhere,
    });
    // Touching: ends exactly when the moved Shift starts (14:00).
    await book({
      churchId,
      eventId: other.event.id,
      participationId: otherParticipation.id,
      roleId: role.id,
      volunteerId: people.touching?.id as string,
      status: 'confirmed',
      start: day20('13:00'),
      end: target,
    });
    const before = await writeSnapshot();

    const response = await preview({
      cycleId: cycle.id,
      eventId: moving.event.id,
      start: target,
    });

    expect(response.statusCode).toBe(200);
    const { clashes } = response.json();
    expect(
      clashes
        .map((row: { volunteer: { name: string } }) => row.volunteer.name)
        .sort(),
    ).toEqual(['confirmed', 'draft', 'pending']);
    expect(clashes[0]).toMatchObject({
      ministry: { id: seed.ministryAId, name: 'Scheduling Ministry A' },
      proposedStart: target,
      proposedEnd: day20('15:00'),
    });
    expect(await writeSnapshot()).toEqual(before);
  });

  it('never clashes a moved Assignment with its own scope, old or new position', async () => {
    const seed = await signIn();
    const churchId = seed.churchAId;
    const cycle = await seedCycle({ churchId, state: 'sent' });
    const moving = await seedScheduledEvent({ churchId, cycleId: cycle.id });
    const role = await buildRole({
      db,
      churchId,
      ministryId: seed.ministryAId,
      name: 'Usher',
    });
    const participation = await buildMinistryParticipation({
      db,
      churchId,
      ministryId: seed.ministryAId,
      eventId: moving.event.id,
      state: 'preparing',
      eventTimeBlockIds: [],
    });
    const volunteer = await seedVolunteer({ churchId, name: 'solo' });
    for (const [start, end] of [
      [at('09:00'), at('10:00')],
      [at('10:00'), at('11:00')],
    ] as const) {
      await book({
        churchId,
        eventId: moving.event.id,
        participationId: participation.id,
        roleId: role.id,
        volunteerId: volunteer.id,
        status: 'confirmed',
        start,
        end,
      });
    }

    // +30 minutes: the new 09:30–10:30 overlaps both old positions.
    const response = await preview({
      cycleId: cycle.id,
      eventId: moving.event.id,
      start: at('09:30'),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().clashes).toEqual([]);
  });

  it('allows the end to spill past the Cycle but not the start day', async () => {
    const seed = await signIn();
    const cycle = await seedCycle({ churchId: seed.churchAId, state: 'sent' });
    const { event: sunday } = await seedScheduledEvent({
      churchId: seed.churchAId,
      cycleId: cycle.id,
    });

    const spill = await preview({
      cycleId: cycle.id,
      eventId: sunday.id,
      start: local({ day: '2026-10-25', time: '23:00' }),
    });
    const outside = await preview({
      cycleId: cycle.id,
      eventId: sunday.id,
      start: local({ day: '2026-10-26', time: '00:30' }),
      locale: 'pt-BR',
    });

    expect(spill.statusCode).toBe(200);
    expect(outside.statusCode).toBe(409);
    expect(outside.json()).toEqual({
      error: 'EVENT_OUTSIDE_CYCLE',
      message: m.error_event_outside_cycle({}, { locale: 'pt-BR' }),
    });
  });

  it('refuses a target that is not in the future with a localized MOVE_WINDOW_CLOSED', async () => {
    const seed = await signIn();
    const cycle = await seedCycle({ churchId: seed.churchAId, state: 'sent' });
    const { event: sunday } = await seedScheduledEvent({
      churchId: seed.churchAId,
      cycleId: cycle.id,
    });

    const response = await preview({
      cycleId: cycle.id,
      eventId: sunday.id,
      start: local({ day: '2026-09-30', time: '10:00' }),
      locale: 'pt-BR',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'MOVE_WINDOW_CLOSED',
      message: m.error_move_window_closed({}, { locale: 'pt-BR' }),
    });
  });

  it('refuses an Event that already started', async () => {
    const seed = await signIn();
    const cycle = await seedCycle({ churchId: seed.churchAId, state: 'sent' });
    const { event: sunday } = await seedScheduledEvent({
      churchId: seed.churchAId,
      cycleId: cycle.id,
    });
    setTestClock({ instant: inst(at('09:30')) });

    const response = await preview({
      cycleId: cycle.id,
      eventId: sunday.id,
      start: local({ day: '2026-10-20', time: '14:00' }),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'MOVE_WINDOW_CLOSED' });
  });

  it.each([
    ['a Draft Cycle', 'draft', 'scheduled'],
    ['a Past Cycle', 'past', 'scheduled'],
    ['a Draft Event of a Sent Cycle', 'sent', 'draft'],
  ] as const)('refuses %s with ILLEGAL_STATE_TRANSITION', async (_name, cycleState, eventStatus) => {
    const seed = await signIn();
    const cycle = await seedCycle({
      churchId: seed.churchAId,
      state: cycleState,
    });
    const { event: sunday } = await seedScheduledEvent({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      status: eventStatus,
    });

    const response = await preview({
      cycleId: cycle.id,
      eventId: sunday.id,
      start: local({ day: '2026-10-20', time: '14:00' }),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'ILLEGAL_STATE_TRANSITION',
    });
  });

  it('answers VALIDATION_ERROR to a malformed start and 404 across Churches', async () => {
    const seed = await signIn();
    const cycle = await seedCycle({ churchId: seed.churchAId, state: 'sent' });
    const { event: sunday } = await seedScheduledEvent({
      churchId: seed.churchAId,
      cycleId: cycle.id,
    });
    const foreignCycle = await buildCycle({
      db,
      churchId: seed.churchBId,
      name: 'Foreign',
      state: 'sent',
      startDate: parseCalendarDay({ value: CYCLE_START }),
      endDate: parseCalendarDay({ value: CYCLE_END }),
    });
    const foreign = await seedScheduledEvent({
      churchId: seed.churchBId,
      cycleId: foreignCycle.id,
    });
    const start = local({ day: '2026-10-20', time: '14:00' });

    const malformed = await preview({
      cycleId: cycle.id,
      eventId: sunday.id,
      start: 'tomorrow',
    });
    const crossChurch = await preview({
      cycleId: foreignCycle.id,
      eventId: foreign.event.id,
      start,
    });

    // The shared validation hook answers VALIDATION_ERROR as 422 on every route.
    expect(malformed.statusCode).toBe(422);
    expect(malformed.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
    expect(crossChurch.statusCode).toBe(404);
  });

  it('answers 403 to a non-admin', async () => {
    const seed = await signIn({ persona: 'member' });
    const cycle = await seedCycle({ churchId: seed.churchAId, state: 'sent' });
    const { event: sunday } = await seedScheduledEvent({
      churchId: seed.churchAId,
      cycleId: cycle.id,
    });

    const response = await preview({
      cycleId: cycle.id,
      eventId: sunday.id,
      start: local({ day: '2026-10-20', time: '14:00' }),
    });

    expect(response.statusCode).toBe(403);
  });
});
