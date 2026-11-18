import {
  assignment,
  assignmentAudit,
  event,
  eventTimeBlock,
  outboxMessage,
  scheduleLastTold,
  shift,
  swapRequest,
  unavailableShift,
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
import { eq, inArray } from 'drizzle-orm';
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
import { DrizzleAssignmentRepository } from '@/infrastructure/repositories/drizzle-assignment.repository';
import { DrizzleAssignmentAuditRepository } from '@/infrastructure/repositories/drizzle-assignment-audit.repository';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleCycleRepository } from '@/infrastructure/repositories/drizzle-cycle.repository';
import { DrizzleEventTemplateRepository } from '@/infrastructure/repositories/drizzle-event-template.repository';
import { DrizzleEventTimeBlockRepository } from '@/infrastructure/repositories/drizzle-event-time-block.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleMinistryParticipationRepository } from '@/infrastructure/repositories/drizzle-ministry-participation.repository';
import { DrizzleOutboxRepository } from '@/infrastructure/repositories/drizzle-outbox.repository';
import { DrizzlePlanningEventRepository } from '@/infrastructure/repositories/drizzle-planning-event.repository';
import { DrizzleShiftRepository } from '@/infrastructure/repositories/drizzle-shift.repository';
import { DrizzleSwapRequestRepository } from '@/infrastructure/repositories/drizzle-swap-request.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { DrizzleUsualSetupRepository } from '@/infrastructure/repositories/drizzle-usual-setup.repository';
import { DrizzleVolunteerRepository } from '@/infrastructure/repositories/drizzle-volunteer.repository';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import { buildMinistry, buildRole } from '@/seeds/builders/ministry';
import {
  buildAssignedShift,
  buildCycle,
  buildEvent,
  buildEventTimeBlock,
  buildMinistryParticipation,
  type SeededCycleLifecycle,
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
    }),
    eventTemplateManager: new DbEventTemplateManager({
      templateRepository,
      unitOfWork,
    }),
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
  state?: SeededCycleLifecycle;
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

function confirm({ cycleId, eventId, start, locale }: PreviewInput) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/admin/cycles/${cycleId}/events/${eventId}/move`,
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
    ['a Past Cycle', 'past-from-sent', 'scheduled'],
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

interface ClashBoardInput {
  /** The elsewhere statuses booked before the preview; the rest come after. */
  bookedBeforePreview: string[];
}

/**
 * The moving Sunday (09–10 per Volunteer, → 14–15 on 20 October) and an
 * Other Event that day where active statuses overlap 14:30–15:30.
 */
async function seedClashBoard({ bookedBeforePreview }: ClashBoardInput) {
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
  const day20 = (time: string) => local({ day: '2026-10-20', time });
  const names = ['draft', 'pending', 'confirmed', 'declined', 'touching'];
  const moved: Record<string, string> = {};
  const volunteers: Record<string, string> = {};
  for (const name of names) {
    const { id } = await seedVolunteer({ churchId, name });
    volunteers[name] = id;
    const booked = await book({
      churchId,
      eventId: moving.event.id,
      participationId: participation.id,
      roleId: role.id,
      volunteerId: id,
      status: 'confirmed',
      start: at('09:00'),
      end: at('10:00'),
    });
    moved[name] = booked.assignment.id;
  }
  const bookElsewhere = async (name: string) => {
    const volunteerId = volunteers[name] as string;
    const touching = name === 'touching';
    await book({
      churchId,
      eventId: other.event.id,
      participationId: otherParticipation.id,
      roleId: role.id,
      volunteerId,
      // Touching ends exactly when the moved Shift starts (14:00).
      status: touching ? 'confirmed' : (name as BookInput['status']),
      start: touching ? day20('13:00') : day20('14:30'),
      end: touching ? day20('14:00') : day20('15:30'),
    });
  };
  for (const name of bookedBeforePreview) await bookElsewhere(name);
  return {
    seed,
    cycle,
    moving,
    moved,
    volunteers,
    bookLater: async () => {
      for (const name of names) {
        if (!bookedBeforePreview.includes(name)) await bookElsewhere(name);
      }
    },
  };
}

describe('POST /admin/cycles/:cycleId/events/:eventId/move', () => {
  it('moves the Event, its blocks and Shifts by one delta, keeping Assignments with their UnavailableShifts and open SwapRequests', async () => {
    const seed = await signIn();
    const churchId = seed.churchAId;
    const cycle = await seedCycle({ churchId, state: 'sent' });
    const {
      event: sunday,
      welcome,
      service,
    } = await seedScheduledEvent({
      churchId,
      cycleId: cycle.id,
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
      eventId: sunday.id,
      state: 'preparing',
      eventTimeBlockIds: [],
    });
    const volunteer = await seedVolunteer({ churchId, name: 'kept' });
    const booked = await book({
      churchId,
      eventId: sunday.id,
      participationId: participation.id,
      roleId: role.id,
      volunteerId: volunteer.id,
      status: 'confirmed',
      start: at('10:00'),
      end: at('11:00'),
    });
    const membership = await buildMinistryMembership({
      db,
      churchId,
      volunteerId: volunteer.id,
      ministryId: seed.ministryAId,
      ministryAccessLevel: 'volunteer',
      roleIds: [role.id],
    });
    const check = await buildConfirmedAvailabilityCheck({
      db,
      churchId,
      cycleId: cycle.id,
      ministryMembershipId: membership.id,
      id: crypto.randomUUID(),
      confirmedAt: inst(CHURCH_OCTOBER_1_NOON),
    });
    await buildUnavailableShift({
      db,
      churchId,
      availabilityCheckId: check.id,
      shiftId: booked.shift.id,
    });
    await db.insert(swapRequest).values({
      churchId,
      assignmentId: booked.assignment.id,
      status: 'open',
      raisedBy: 'user-kept',
    });
    const snapshotsBefore = await db.select().from(scheduleLastTold);
    const unavailableBefore = await db.select().from(unavailableShift);

    const response = await confirm({
      cycleId: cycle.id,
      eventId: sunday.id,
      start: local({ day: '2026-10-20', time: '14:00' }),
    });

    expect(response.statusCode).toBe(200);
    const toDay = (time: string) => local({ day: '2026-10-20', time });
    const body = response.json();
    expect(body.event).toMatchObject({
      id: sunday.id,
      start: toDay('14:00'),
      end: toDay('17:00'),
    });
    const blockBounds = Object.fromEntries(
      body.eventTimeBlocks.map(
        (block: { id: string; startTime: string; endTime: string }) => [
          block.id,
          [block.startTime, block.endTime],
        ],
      ),
    );
    expect(blockBounds).toEqual({
      [welcome.id]: [toDay('14:00'), toDay('15:00')],
      [service.id]: [toDay('15:00'), toDay('17:00')],
      [booked.eventTimeBlock.id]: [toDay('15:00'), toDay('16:00')],
    });
    expect(body.withdrawn).toEqual([]);
    const [movedShift] = await db
      .select()
      .from(shift)
      .where(eq(shift.id, booked.shift.id));
    expect(movedShift?.startTime.toISOString()).toBe(toDay('15:00'));
    expect(movedShift?.endTime.toISOString()).toBe(toDay('16:00'));
    const [kept] = await db
      .select()
      .from(assignment)
      .where(eq(assignment.id, booked.assignment.id));
    expect(kept).toMatchObject({
      shiftId: booked.shift.id,
      status: 'confirmed',
    });
    expect(await db.select().from(unavailableShift)).toEqual(unavailableBefore);
    const [swap] = await db.select().from(swapRequest);
    expect(swap?.status).toBe('open');
    // Send updates tells Volunteers later: no snapshot and only leaders' N10.
    expect(await db.select().from(scheduleLastTold)).toEqual(snapshotsBefore);
    const queued = await db.select().from(outboxMessage);
    expect(queued.map(({ payload }) => payload)).toEqual([
      expect.objectContaining({
        kind: 'event_changed',
        to: expect.objectContaining({ userId: seed.adminUserId }),
      }),
    ]);
  });

  it('recalculates over a stale preview and withdraws only the actual active clashes, closing their open SwapRequests as covered', async () => {
    const board = await seedClashBoard({ bookedBeforePreview: ['confirmed'] });
    const target = local({ day: '2026-10-20', time: '14:00' });
    const stale = await preview({
      cycleId: board.cycle.id,
      eventId: board.moving.event.id,
      start: target,
    });
    await board.bookLater();
    await db.insert(swapRequest).values({
      churchId: board.seed.churchAId,
      assignmentId: board.moved.pending as string,
      status: 'open',
      raisedBy: 'user-pending',
    });

    const response = await confirm({
      cycleId: board.cycle.id,
      eventId: board.moving.event.id,
      start: target,
    });

    const names = (rows: { volunteer: { name: string } }[]) =>
      rows.map((row) => row.volunteer.name).sort();
    expect(names(stale.json().clashes)).toEqual(['confirmed']);
    expect(response.statusCode).toBe(200);
    expect(names(response.json().withdrawn)).toEqual([
      'confirmed',
      'draft',
      'pending',
    ]);
    const remaining = await db
      .select({ id: assignment.id })
      .from(assignment)
      .where(inArray(assignment.id, Object.values(board.moved) as string[]));
    expect(remaining.map(({ id }) => id).sort()).toEqual(
      [board.moved.declined, board.moved.touching].sort(),
    );
    const [swap] = await db.select().from(swapRequest);
    expect(swap).toMatchObject({
      status: 'covered',
      closedBy: board.seed.adminUserId,
    });
  });

  it('enqueues one N10 move row per affected leader, counting withdrawn Volunteers, with fallback that skips the acting admin', async () => {
    const board = await seedClashBoard({
      bookedBeforePreview: ['draft', 'pending', 'confirmed', 'touching'],
    });
    const { seed, cycle, moving } = board;
    const churchId = seed.churchAId;
    // Ministry A answered for the old time; a leaderless Ministry opted in.
    const membership = await buildMinistryMembership({
      db,
      churchId,
      volunteerId: board.volunteers.draft as string,
      ministryId: seed.ministryAId,
      ministryAccessLevel: 'volunteer',
      roleIds: [],
    });
    await buildConfirmedAvailabilityCheck({
      db,
      churchId,
      cycleId: cycle.id,
      ministryMembershipId: membership.id,
      id: crypto.randomUUID(),
      confirmedAt: inst(CHURCH_OCTOBER_1_NOON),
    });
    const leaderless = await buildMinistry({
      db,
      churchId,
      name: 'Leaderless',
    });
    await buildMinistryParticipation({
      db,
      churchId,
      ministryId: leaderless.id,
      eventId: moving.event.id,
      state: 'preparing',
      eventTimeBlockIds: [moving.welcome.id],
    });
    // Opted out of the moved Event: told nothing.
    const absent = await buildMinistry({ db, churchId, name: 'Absent' });
    await buildMinistryParticipation({
      db,
      churchId,
      ministryId: absent.id,
      eventId: moving.event.id,
      state: 'preparing',
      eventTimeBlockIds: [],
    });
    await buildUser({ db, id: 'other-admin', name: 'Other', email: 'o@t.com' });
    await buildChurchMembership({
      db,
      churchId,
      userId: 'other-admin',
      accessLevel: 'admin',
    });

    const response = await confirm({
      cycleId: cycle.id,
      eventId: moving.event.id,
      start: local({ day: '2026-10-20', time: '14:00' }),
    });

    expect(response.statusCode).toBe(200);
    const rows = await db.select().from(outboxMessage);
    const byUser = Object.fromEntries(
      rows.map(({ payload }) => {
        const { to, data } = payload as {
          to: { userId: string };
          data: unknown;
        };
        return [to.userId, data];
      }),
    );
    expect(Object.keys(byUser).sort()).toEqual(
      [seed.adminUserId, 'other-admin'].sort(),
    );
    const change = {
      kind: 'move',
      previousStart: at('09:00'),
      previousEnd: at('12:00'),
      start: local({ day: '2026-10-20', time: '14:00' }),
      end: local({ day: '2026-10-20', time: '17:00' }),
    };
    expect(byUser[seed.adminUserId]).toMatchObject({
      cycleId: cycle.id,
      eventId: moving.event.id,
      eventTitle: 'Sunday',
      adminName: 'Scheduling Admin',
      ministries: [{ id: seed.ministryAId, name: 'Scheduling Ministry A' }],
      change: {
        ...change,
        // Five served the moved Event; three were withdrawn for clashes.
        volunteerCount: 5,
        impacts: [
          {
            ministryId: seed.ministryAId,
            ministryName: 'Scheduling Ministry A',
            volunteerCount: 5,
            answersGiven: true,
          },
        ],
      },
    });
    expect(byUser['other-admin']).toMatchObject({
      ministries: [{ id: leaderless.id, name: 'Leaderless' }],
      change: {
        ...change,
        volunteerCount: 0,
        impacts: [
          {
            ministryId: leaderless.id,
            ministryName: 'Leaderless',
            volunteerCount: 0,
            answersGiven: false,
          },
        ],
      },
    });
  });

  it('refuses as preview does and writes nothing', async () => {
    const seed = await signIn();
    const cycle = await seedCycle({ churchId: seed.churchAId, state: 'sent' });
    const { event: sunday } = await seedScheduledEvent({
      churchId: seed.churchAId,
      cycleId: cycle.id,
    });
    const before = await writeSnapshot();

    const past = await confirm({
      cycleId: cycle.id,
      eventId: sunday.id,
      start: local({ day: '2026-09-30', time: '10:00' }),
      locale: 'pt-BR',
    });
    const outside = await confirm({
      cycleId: cycle.id,
      eventId: sunday.id,
      start: local({ day: '2026-10-26', time: '00:30' }),
    });

    expect(past.statusCode).toBe(409);
    expect(past.json()).toEqual({
      error: 'MOVE_WINDOW_CLOSED',
      message: m.error_move_window_closed({}, { locale: 'pt-BR' }),
    });
    expect(outside.statusCode).toBe(409);
    expect(outside.json()).toMatchObject({ error: 'EVENT_OUTSIDE_CYCLE' });
    expect(await writeSnapshot()).toEqual(before);
  });

  it('answers 403 to a non-admin', async () => {
    const seed = await signIn({ persona: 'member' });
    const cycle = await seedCycle({ churchId: seed.churchAId, state: 'sent' });
    const { event: sunday } = await seedScheduledEvent({
      churchId: seed.churchAId,
      cycleId: cycle.id,
    });

    const response = await confirm({
      cycleId: cycle.id,
      eventId: sunday.id,
      start: local({ day: '2026-10-20', time: '14:00' }),
    });

    expect(response.statusCode).toBe(403);
  });
});

interface BlockMoveInput extends PreviewInput {
  eventTimeBlockId: string;
}

function blockMove(path: 'move' | 'move/preview') {
  return ({ cycleId, eventId, eventTimeBlockId, start }: BlockMoveInput) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/admin/cycles/${cycleId}/events/${eventId}/event-time-blocks/${eventTimeBlockId}/${path}`,
      payload: { start } as never,
    });
}
const previewBlock = blockMove('move/preview');
const confirmBlock = blockMove('move');

/**
 * Sunday 09–12 (Welcome 09–10, Service 10–12) with a Ministry A Participation
 * and two booked blocks: Moving 10–11 (Ana, with an UnavailableShift and open
 * SwapRequest) and Staying 11–12 (Bruno).
 */
async function seedBlockBoard() {
  const seed = await signIn();
  const churchId = seed.churchAId;
  const cycle = await seedCycle({ churchId, state: 'sent' });
  const sunday = await seedScheduledEvent({ churchId, cycleId: cycle.id });
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
    eventId: sunday.event.id,
    state: 'preparing',
    eventTimeBlockIds: [],
  });
  const ana = await seedVolunteer({ churchId, name: 'ana' });
  const bruno = await seedVolunteer({ churchId, name: 'bruno' });
  const bookFor = (volunteerId: string, start: string, end: string) =>
    book({
      churchId,
      eventId: sunday.event.id,
      participationId: participation.id,
      roleId: role.id,
      volunteerId,
      status: 'confirmed',
      start: at(start),
      end: at(end),
    });
  const moving = await bookFor(ana.id, '10:00', '11:00');
  const staying = await bookFor(bruno.id, '11:00', '12:00');
  return {
    seed,
    churchId,
    cycle,
    sunday,
    role,
    participation,
    ana,
    bruno,
    moving,
    staying,
  };
}

describe('POST /admin/cycles/:cycleId/events/:eventId/event-time-blocks/:eventTimeBlockId/move/preview', () => {
  it('moves only the block, stretches the Event both ways, never shrinks it, and writes nothing', async () => {
    const board = await seedBlockBoard();
    const { cycle, sunday, moving, staying } = board;
    const before = await writeSnapshot();
    const ask = (blockId: string, start: string) =>
      previewBlock({
        cycleId: cycle.id,
        eventId: sunday.event.id,
        eventTimeBlockId: blockId,
        start,
      });

    const later = await ask(moving.eventTimeBlock.id, at('13:00'));
    const earlier = await ask(moving.eventTimeBlock.id, at('08:00'));
    // The Event's last block moves earlier: the end stays, nothing shrinks.
    const inward = await ask(staying.eventTimeBlock.id, at('09:30'));

    expect(later.statusCode).toBe(200);
    expect(later.json().event).toEqual({
      previous: { start: at('09:00'), end: at('12:00') },
      proposed: { start: at('09:00'), end: at('14:00') },
    });
    const movedFlags = Object.fromEntries(
      later
        .json()
        .eventTimeBlocks.map((b: { id: string; moved: boolean }) => [
          b.id,
          b.moved,
        ]),
    );
    expect(movedFlags).toEqual({
      [sunday.welcome.id]: false,
      [sunday.service.id]: false,
      [moving.eventTimeBlock.id]: true,
      [staying.eventTimeBlock.id]: false,
    });
    expect(later.json().eventTimeBlocks).toContainEqual(
      expect.objectContaining({
        id: moving.eventTimeBlock.id,
        proposed: { start: at('13:00'), end: at('14:00') },
      }),
    );
    expect(earlier.json().event.proposed).toEqual({
      start: at('08:00'),
      end: at('12:00'),
    });
    expect(inward.json().event.proposed).toEqual({
      start: at('09:00'),
      end: at('12:00'),
    });
    expect(await writeSnapshot()).toEqual(before);
  });

  it('answers 404 to an unknown block and to a block of another Event', async () => {
    const board = await seedBlockBoard();
    const { churchId, cycle, sunday } = board;
    const other = await seedScheduledEvent({
      churchId,
      cycleId: cycle.id,
      title: 'Other',
      start: local({ day: '2026-10-20', time: '08:00' }),
      end: local({ day: '2026-10-20', time: '10:00' }),
    });
    const input = {
      cycleId: cycle.id,
      eventId: sunday.event.id,
      start: at('13:00'),
    };

    const unknown = await previewBlock({
      ...input,
      eventTimeBlockId: crypto.randomUUID(),
    });
    const foreign = await confirmBlock({
      ...input,
      eventTimeBlockId: other.welcome.id,
    });

    expect(unknown.statusCode).toBe(404);
    expect(foreign.statusCode).toBe(404);
  });

  it('refuses a block whose stretched Event start leaves the Cycle in the Church Timezone', async () => {
    const board = await seedBlockBoard();
    // 11 Oct 23:30 São Paulo is 12 Oct 02:30 UTC: inside the Cycle in UTC only.
    const response = await previewBlock({
      cycleId: board.cycle.id,
      eventId: board.sunday.event.id,
      eventTimeBlockId: board.moving.eventTimeBlock.id,
      start: local({ day: '2026-10-11', time: '23:30' }),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'EVENT_OUTSIDE_CYCLE' });
  });
});

describe('POST /admin/cycles/:cycleId/events/:eventId/event-time-blocks/:eventTimeBlockId/move', () => {
  it('moves only the block and its Shifts, keeping the other blocks and Assignments, withdrawing only the block clash', async () => {
    const board = await seedBlockBoard();
    const { churchId, cycle, sunday, moving, staying, ana, bruno } = board;
    const membership = await buildMinistryMembership({
      db,
      churchId,
      volunteerId: ana.id,
      ministryId: board.seed.ministryAId,
      ministryAccessLevel: 'volunteer',
      roleIds: [board.role.id],
    });
    const check = await buildConfirmedAvailabilityCheck({
      db,
      churchId,
      cycleId: cycle.id,
      ministryMembershipId: membership.id,
      id: crypto.randomUUID(),
      confirmedAt: inst(CHURCH_OCTOBER_1_NOON),
    });
    await buildUnavailableShift({
      db,
      churchId,
      availabilityCheckId: check.id,
      shiftId: moving.shift.id,
    });
    await db.insert(swapRequest).values({
      churchId,
      assignmentId: moving.assignment.id,
      status: 'open',
      raisedBy: 'user-ana',
    });
    // Bruno clashes with the moved block at 13:30; Ana does not.
    const other = await seedScheduledEvent({
      churchId,
      cycleId: cycle.id,
      title: 'Other',
      start: at('13:00'),
      end: at('16:00'),
    });
    const otherParticipation = await buildMinistryParticipation({
      db,
      churchId,
      ministryId: board.seed.ministryAId,
      eventId: other.event.id,
      state: 'preparing',
      eventTimeBlockIds: [],
    });
    await book({
      churchId,
      eventId: other.event.id,
      participationId: otherParticipation.id,
      roleId: board.role.id,
      volunteerId: bruno.id,
      status: 'confirmed',
      start: at('13:30'),
      end: at('14:30'),
    });
    // Bruno's own Staying block now also sits 13:00–14:00 only if it moved: it must not.
    const unavailableBefore = await db.select().from(unavailableShift);
    const snapshotsBefore = await db.select().from(scheduleLastTold);

    const response = await confirmBlock({
      cycleId: cycle.id,
      eventId: sunday.event.id,
      eventTimeBlockId: moving.eventTimeBlock.id,
      start: at('13:00'),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.event).toMatchObject({ start: at('09:00'), end: at('14:00') });
    const bounds = Object.fromEntries(
      body.eventTimeBlocks.map(
        (b: { id: string; startTime: string; endTime: string }) => [
          b.id,
          [b.startTime, b.endTime],
        ],
      ),
    );
    expect(bounds).toEqual({
      [sunday.welcome.id]: [at('09:00'), at('10:00')],
      [sunday.service.id]: [at('10:00'), at('12:00')],
      [moving.eventTimeBlock.id]: [at('13:00'), at('14:00')],
      [staying.eventTimeBlock.id]: [at('11:00'), at('12:00')],
    });
    expect(body.withdrawn).toEqual([]);
    const shifts = await db.select().from(shift);
    const shiftBounds = Object.fromEntries(
      shifts.map((s) => [
        s.id,
        [s.startTime.toISOString(), s.endTime.toISOString()],
      ]),
    );
    expect(shiftBounds[moving.shift.id]).toEqual([at('13:00'), at('14:00')]);
    expect(shiftBounds[staying.shift.id]).toEqual([at('11:00'), at('12:00')]);
    const kept = await db
      .select()
      .from(assignment)
      .where(eq(assignment.id, moving.assignment.id));
    expect(kept).toHaveLength(1);
    expect(await db.select().from(unavailableShift)).toEqual(unavailableBefore);
    const [swap] = await db.select().from(swapRequest);
    expect(swap?.status).toBe('open');
    expect(await db.select().from(scheduleLastTold)).toEqual(snapshotsBefore);
    // Bruno's Staying Assignment is untouched.
    expect(
      await db
        .select({ id: assignment.id })
        .from(assignment)
        .where(eq(assignment.id, staying.assignment.id)),
    ).toHaveLength(1);
  });

  it('withdraws only the clashing Assignment of the moved block', async () => {
    const board = await seedBlockBoard();
    const { churchId, cycle, sunday, moving, staying, ana } = board;
    const other = await seedScheduledEvent({
      churchId,
      cycleId: cycle.id,
      title: 'Other',
      start: at('13:00'),
      end: at('16:00'),
    });
    const otherParticipation = await buildMinistryParticipation({
      db,
      churchId,
      ministryId: board.seed.ministryAId,
      eventId: other.event.id,
      state: 'preparing',
      eventTimeBlockIds: [],
    });
    // Ana serves the Other Event 13:30–14:30, overlapping the moved 13–14.
    await book({
      churchId,
      eventId: other.event.id,
      participationId: otherParticipation.id,
      roleId: board.role.id,
      volunteerId: ana.id,
      status: 'confirmed',
      start: at('13:30'),
      end: at('14:30'),
    });
    await db.insert(swapRequest).values({
      churchId,
      assignmentId: moving.assignment.id,
      status: 'open',
      raisedBy: 'user-ana',
    });

    const response = await confirmBlock({
      cycleId: cycle.id,
      eventId: sunday.event.id,
      eventTimeBlockId: moving.eventTimeBlock.id,
      start: at('13:00'),
    });

    expect(response.statusCode).toBe(200);
    expect(
      response
        .json()
        .withdrawn.map(
          (row: { volunteer: { name: string } }) => row.volunteer.name,
        ),
    ).toEqual(['ana']);
    expect(
      await db
        .select({ id: assignment.id })
        .from(assignment)
        .where(eq(assignment.id, moving.assignment.id)),
    ).toEqual([]);
    expect(
      await db
        .select({ id: assignment.id })
        .from(assignment)
        .where(eq(assignment.id, staying.assignment.id)),
    ).toHaveLength(1);
    const [swap] = await db.select().from(swapRequest);
    expect(swap).toMatchObject({ status: 'covered' });
  });

  it('tells only the leaders of Ministries opted into the moved block through N10 with the block bounds', async () => {
    const seed = await signIn();
    const churchId = seed.churchAId;
    const cycle = await seedCycle({ churchId, state: 'sent' });
    const sunday = await seedScheduledEvent({ churchId, cycleId: cycle.id });
    const opted = await buildMinistry({ db, churchId, name: 'Opted' });
    await buildMinistryParticipation({
      db,
      churchId,
      ministryId: opted.id,
      eventId: sunday.event.id,
      state: 'preparing',
      eventTimeBlockIds: [sunday.service.id],
    });
    const welcomeOnly = await buildMinistry({
      db,
      churchId,
      name: 'Welcomers',
    });
    await buildMinistryParticipation({
      db,
      churchId,
      ministryId: welcomeOnly.id,
      eventId: sunday.event.id,
      state: 'preparing',
      eventTimeBlockIds: [sunday.welcome.id],
    });
    await buildUser({ db, id: 'other-admin', name: 'Other', email: 'o@t.com' });
    await buildChurchMembership({
      db,
      churchId,
      userId: 'other-admin',
      accessLevel: 'admin',
    });

    const response = await confirmBlock({
      cycleId: cycle.id,
      eventId: sunday.event.id,
      eventTimeBlockId: sunday.service.id,
      start: at('13:00'),
    });

    expect(response.statusCode).toBe(200);
    const rows = await db.select().from(outboxMessage);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toMatchObject({
      kind: 'event_changed',
      to: expect.objectContaining({ userId: 'other-admin' }),
      data: {
        ministries: [{ id: opted.id, name: 'Opted' }],
        change: {
          kind: 'move',
          previousStart: at('10:00'),
          previousEnd: at('12:00'),
          start: at('13:00'),
          end: at('15:00'),
          volunteerCount: 0,
          impacts: [expect.objectContaining({ ministryId: opted.id })],
        },
      },
    });
  });

  it('refuses a stretched start outside the Cycle and writes nothing', async () => {
    const board = await seedBlockBoard();
    const before = await writeSnapshot();

    const response = await confirmBlock({
      cycleId: board.cycle.id,
      eventId: board.sunday.event.id,
      eventTimeBlockId: board.moving.eventTimeBlock.id,
      start: local({ day: '2026-10-11', time: '23:30' }),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'EVENT_OUTSIDE_CYCLE' });
    expect(await writeSnapshot()).toEqual(before);
  });
});
