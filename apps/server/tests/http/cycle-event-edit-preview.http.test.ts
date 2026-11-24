import {
  assignment,
  assignmentAudit,
  church,
  event,
  eventTimeBlock,
  eventTimeBlockMove,
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
import { DrizzleTemplatePrecedenceRepository } from '@/infrastructure/repositories/drizzle-template-precedence.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { DrizzleUsualSetupRepository } from '@/infrastructure/repositories/drizzle-usual-setup.repository';
import { DrizzleVolunteerRepository } from '@/infrastructure/repositories/drizzle-volunteer.repository';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildUser } from '@/seeds/builders/identity';
import { buildRole } from '@/seeds/builders/ministry';
import {
  buildAssignedShift,
  buildAssignment,
  buildCycle,
  buildEvent,
  buildEventTimeBlock,
  buildMinistryParticipation,
  buildShift,
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
import { nullChurchIdentity } from '@/tests/test-support/church-identity-snapshotter';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
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
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
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
        churchIdentity: nullChurchIdentity,
        outboxRepository: new DrizzleOutboxRepository({ db }),
      }),
    }),
    planningEventManager: new DbPlanningEventManager({
      cycleRepository,
      eventRepository,
      precedenceRepository: new DrizzleTemplatePrecedenceRepository({ db }),
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
        churchIdentity: nullChurchIdentity,
        outboxRepository: new DrizzleOutboxRepository({ db }),
      }),
    }),
    eventTemplateManager: new DbEventTemplateManager({
      templateRepository,
      precedenceRepository: new DrizzleTemplatePrecedenceRepository({ db }),
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

interface EditBlockBody {
  id?: string;
  label: string;
  startTime: string;
  endTime: string;
}

interface EditBody {
  start: string;
  end: string;
  eventTimeBlocks: EditBlockBody[];
}

interface PreviewInput {
  cycleId: string;
  eventId: string;
  body: EditBody;
}

function preview({ cycleId, eventId, body }: PreviewInput) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/admin/cycles/${cycleId}/events/${eventId}/edit/preview`,
    payload: body as never,
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
  status: 'draft' | 'pending' | 'confirmed' | 'cancelled';
}

function book({ start, end, ...rest }: BookInput) {
  return buildAssignedShift({
    db,
    ...rest,
    start: inst(start),
    end: inst(end),
  });
}

type ScheduledEvent = Awaited<ReturnType<typeof seedScheduledEvent>>;

/** The Sunday as stored: 09–12 with Welcome 09–10 and Service 10–12. */
function currentBody({ welcome, service }: ScheduledEvent): EditBody {
  return {
    start: at('09:00'),
    end: at('12:00'),
    eventTimeBlocks: [
      {
        id: welcome.id,
        label: 'Welcome',
        startTime: at('09:00'),
        endTime: at('10:00'),
      },
      {
        id: service.id,
        label: 'Service',
        startTime: at('10:00'),
        endTime: at('12:00'),
      },
    ],
  };
}

interface StaffedSundayInput {
  churchId: string;
  ministryId: string;
}

/**
 * The Sunday with a third block, Media 10–12, where Ana serves 10–12; Ana
 * also serves the Other Event 13–14 and Bia, on Media too, serves it 14–15.
 */
async function seedStaffedSunday({ churchId, ministryId }: StaffedSundayInput) {
  const cycle = await seedCycle({ churchId, state: 'sent' });
  const sunday = await seedScheduledEvent({ churchId, cycleId: cycle.id });
  const other = await seedScheduledEvent({
    churchId,
    cycleId: cycle.id,
    title: 'Other',
    start: at('13:00'),
    end: at('16:00'),
  });
  const role = await buildRole({ db, churchId, ministryId, name: 'Usher' });
  const participation = await buildMinistryParticipation({
    db,
    churchId,
    ministryId,
    eventId: sunday.event.id,
    state: 'preparing',
    eventTimeBlockIds: [],
  });
  const otherParticipation = await buildMinistryParticipation({
    db,
    churchId,
    ministryId,
    eventId: other.event.id,
    state: 'preparing',
    eventTimeBlockIds: [],
  });
  const ana = await seedVolunteer({ churchId, name: 'ana' });
  const bia = await seedVolunteer({ churchId, name: 'bia' });
  const media = await book({
    churchId,
    eventId: sunday.event.id,
    participationId: participation.id,
    roleId: role.id,
    volunteerId: ana.id,
    status: 'confirmed',
    start: at('10:00'),
    end: at('12:00'),
  });
  await db
    .update(eventTimeBlock)
    .set({ label: 'Media' })
    .where(eq(eventTimeBlock.id, media.eventTimeBlock.id));
  await buildAssignment({
    db,
    churchId,
    participationId: participation.id,
    shiftId: media.shift.id,
    volunteerId: bia.id,
    roleId: role.id,
    shiftRequirementId: media.assignment.shiftRequirementId,
    status: 'confirmed',
  });
  for (const [volunteerId, start, end] of [
    [ana.id, '13:00', '14:00'],
    [bia.id, '14:00', '15:00'],
  ] as const) {
    await book({
      churchId,
      eventId: other.event.id,
      participationId: otherParticipation.id,
      roleId: role.id,
      volunteerId,
      status: 'confirmed',
      start: at(start),
      end: at(end),
    });
  }
  return { cycle, sunday, media, ana };
}

describe('POST /admin/cycles/:cycleId/events/:eventId/edit/preview', () => {
  it('proposes the new bounds with a row per kept, added and dropped block, and writes nothing', async () => {
    const seed = await signIn();
    const cycle = await seedCycle({ churchId: seed.churchAId, state: 'sent' });
    const sunday = await seedScheduledEvent({
      churchId: seed.churchAId,
      cycleId: cycle.id,
    });
    const before = await writeSnapshot();

    const response = await preview({
      cycleId: cycle.id,
      eventId: sunday.event.id,
      body: {
        start: at('09:00'),
        end: at('15:00'),
        eventTimeBlocks: [
          {
            id: sunday.service.id,
            label: 'Service',
            startTime: at('10:00'),
            endTime: at('14:00'),
          },
          { label: 'Lunch', startTime: at('14:00'), endTime: at('15:00') },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      event: {
        previous: { start: at('09:00'), end: at('12:00') },
        proposed: { start: at('09:00'), end: at('15:00') },
      },
      eventTimeBlocks: [
        {
          id: sunday.service.id,
          label: 'Service',
          change: 'kept',
          previous: { start: at('10:00'), end: at('12:00') },
          proposed: { start: at('10:00'), end: at('14:00') },
        },
        {
          id: null,
          label: 'Lunch',
          change: 'added',
          previous: null,
          proposed: { start: at('14:00'), end: at('15:00') },
        },
        {
          id: sunday.welcome.id,
          label: 'Welcome',
          change: 'dropped',
          previous: { start: at('09:00'), end: at('10:00') },
          proposed: null,
        },
      ],
      clashes: [],
    });
    expect(await writeSnapshot()).toEqual(before);
  });

  it('previews an edit of an Event that is running', async () => {
    const seed = await signIn();
    const cycle = await seedCycle({ churchId: seed.churchAId, state: 'sent' });
    const sunday = await seedScheduledEvent({
      churchId: seed.churchAId,
      cycleId: cycle.id,
    });
    setTestClock({ instant: inst(at('11:00')) });
    const body = currentBody(sunday);
    const [, service] = body.eventTimeBlocks;

    const response = await preview({
      cycleId: cycle.id,
      eventId: sunday.event.id,
      body: {
        ...body,
        end: at('14:00'),
        eventTimeBlocks: [
          body.eventTimeBlocks[0] as EditBlockBody,
          { ...(service as EditBlockBody), endTime: at('14:00') },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().event.proposed).toEqual({
      start: at('09:00'),
      end: at('14:00'),
    });
  });

  it('refuses an Event that has ended with a localized EDIT_WINDOW_CLOSED', async () => {
    const seed = await signIn();
    const cycle = await seedCycle({ churchId: seed.churchAId, state: 'sent' });
    const sunday = await seedScheduledEvent({
      churchId: seed.churchAId,
      cycleId: cycle.id,
    });
    setTestClock({ instant: inst(at('12:00')) });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/cycles/${cycle.id}/events/${sunday.event.id}/edit/preview`,
      payload: currentBody(sunday) as never,
      cookies: { [testLocale.localeCookieName]: 'pt-BR' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'EDIT_WINDOW_CLOSED',
      message: m.error_edit_window_closed({}, { locale: 'pt-BR' }),
    });
  });

  it('lists a typed clash row when a Shift follows its block into another Assignment, sparing a touching one, and writes nothing', async () => {
    const seed = await signIn();
    const { cycle, sunday, media, ana } = await seedStaffedSunday({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
    });
    const body = currentBody(sunday);
    const before = await writeSnapshot();

    // Media 10–12 → 10–14: its whole-block Shift follows to 10–14.
    const response = await preview({
      cycleId: cycle.id,
      eventId: sunday.event.id,
      body: {
        ...body,
        end: at('14:00'),
        eventTimeBlocks: [
          ...body.eventTimeBlocks,
          {
            id: media.eventTimeBlock.id,
            label: 'Media',
            startTime: at('10:00'),
            endTime: at('14:00'),
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().clashes).toEqual([
      {
        assignmentId: media.assignment.id,
        eventTimeBlockId: media.eventTimeBlock.id,
        shiftId: media.shift.id,
        volunteer: { id: ana.id, name: 'ana' },
        ministry: { id: seed.ministryAId, name: 'Scheduling Ministry A' },
        proposedStart: at('10:00'),
        proposedEnd: at('14:00'),
      },
    ]);
    expect(await writeSnapshot()).toEqual(before);
  });

  it('previews a running Shift keeping its start while its end follows the block into a clash', async () => {
    const seed = await signIn();
    const { cycle, sunday, media, ana } = await seedStaffedSunday({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
    });
    // Ana and Bia serve Media's second half, 11–12, running at 11:30.
    await db
      .update(shift)
      .set({ startTime: new Date(at('11:00')) })
      .where(eq(shift.id, media.shift.id));
    setTestClock({ instant: inst(at('11:30')) });
    const body = currentBody(sunday);

    // Media 10–12 → 10–13:30: the rest of it, 11:30–12, becomes 11:30–13:30.
    const response = await preview({
      cycleId: cycle.id,
      eventId: sunday.event.id,
      body: {
        ...body,
        end: at('13:30'),
        eventTimeBlocks: [
          ...body.eventTimeBlocks,
          {
            id: media.eventTimeBlock.id,
            label: 'Media',
            startTime: at('10:00'),
            endTime: at('13:30'),
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().clashes).toEqual([
      {
        assignmentId: media.assignment.id,
        eventTimeBlockId: media.eventTimeBlock.id,
        shiftId: media.shift.id,
        volunteer: { id: ana.id, name: 'ana' },
        ministry: { id: seed.ministryAId, name: 'Scheduling Ministry A' },
        proposedStart: at('11:00'),
        proposedEnd: at('13:30'),
      },
    ]);
  });

  it('refuses dropping a staffed block with STAFFED_EVENT_TIME_BLOCK_DROP', async () => {
    const seed = await signIn();
    const { cycle, sunday } = await seedStaffedSunday({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
    });

    const response = await preview({
      cycleId: cycle.id,
      eventId: sunday.event.id,
      body: currentBody(sunday),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'STAFFED_EVENT_TIME_BLOCK_DROP',
    });
  });

  it.each([
    [
      'a block outside the Event bounds',
      (body: EditBody) => ({ ...body, end: at('11:00') }),
      'EVENT_TIME_BLOCK_OUT_OF_BOUNDS',
      'eventTimeBlocks.1',
    ],
    [
      'a duplicate label',
      (body: EditBody) => ({
        ...body,
        eventTimeBlocks: body.eventTimeBlocks.map((block) => ({
          ...block,
          label: 'Service',
        })),
      }),
      'DUPLICATE_EVENT_TIME_BLOCK_LABEL',
      'eventTimeBlocks.1.label',
    ],
    [
      'a block ending before it starts',
      (body: EditBody) => ({
        ...body,
        eventTimeBlocks: body.eventTimeBlocks.map((block, index) =>
          index === 0
            ? { ...block, startTime: at('10:00'), endTime: at('09:00') }
            : block,
        ),
      }),
      'INVALID_EVENT_BOUNDS',
      'eventTimeBlocks.0.endTime',
    ],
  ] as const)('refuses %s with VALIDATION_ERROR', async (_name, change, reason, field) => {
    const seed = await signIn();
    const cycle = await seedCycle({ churchId: seed.churchAId, state: 'sent' });
    const sunday = await seedScheduledEvent({
      churchId: seed.churchAId,
      cycleId: cycle.id,
    });

    const response = await preview({
      cycleId: cycle.id,
      eventId: sunday.event.id,
      body: change(currentBody(sunday)),
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      error: 'VALIDATION_ERROR',
      reason,
      field,
    });
  });

  it('refuses an empty label with VALIDATION_ERROR', async () => {
    const seed = await signIn();
    const cycle = await seedCycle({ churchId: seed.churchAId, state: 'sent' });
    const sunday = await seedScheduledEvent({
      churchId: seed.churchAId,
      cycleId: cycle.id,
    });
    const body = currentBody(sunday);

    const response = await preview({
      cycleId: cycle.id,
      eventId: sunday.event.id,
      body: {
        ...body,
        eventTimeBlocks: [
          ...body.eventTimeBlocks,
          { label: ' ', startTime: at('11:00'), endTime: at('12:00') },
        ],
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
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
    const sunday = await seedScheduledEvent({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      status: eventStatus,
    });

    const response = await preview({
      cycleId: cycle.id,
      eventId: sunday.event.id,
      body: currentBody(sunday),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'ILLEGAL_STATE_TRANSITION',
    });
  });

  it('answers 404 to a block of another Event and across Churches', async () => {
    const seed = await signIn();
    const cycle = await seedCycle({ churchId: seed.churchAId, state: 'sent' });
    const sunday = await seedScheduledEvent({
      churchId: seed.churchAId,
      cycleId: cycle.id,
    });
    const other = await seedScheduledEvent({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      title: 'Other',
      start: at('13:00'),
      end: at('16:00'),
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
    const body = currentBody(sunday);

    const alienBlock = await preview({
      cycleId: cycle.id,
      eventId: sunday.event.id,
      body: {
        ...body,
        eventTimeBlocks: [
          ...body.eventTimeBlocks,
          {
            id: other.service.id,
            label: 'Elsewhere',
            startTime: at('11:00'),
            endTime: at('12:00'),
          },
        ],
      },
    });
    const crossChurch = await preview({
      cycleId: foreignCycle.id,
      eventId: foreign.event.id,
      body: currentBody(foreign),
    });

    expect(alienBlock.statusCode).toBe(404);
    expect(crossChurch.statusCode).toBe(404);
  });

  it('answers 403 to a non-admin', async () => {
    const seed = await signIn({ persona: 'member' });
    const cycle = await seedCycle({ churchId: seed.churchAId, state: 'sent' });
    const sunday = await seedScheduledEvent({
      churchId: seed.churchAId,
      cycleId: cycle.id,
    });

    const response = await preview({
      cycleId: cycle.id,
      eventId: sunday.event.id,
      body: currentBody(sunday),
    });

    expect(response.statusCode).toBe(403);
  });
});

function apply({ cycleId, eventId, body }: PreviewInput) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/admin/cycles/${cycleId}/events/${eventId}/edit`,
    payload: body as never,
  });
}

interface StoredBounds {
  startTime: Date;
  endTime: Date;
}

const boundsOf = (row: StoredBounds | undefined) =>
  row && [row.startTime.toISOString(), row.endTime.toISOString()];

describe('POST /admin/cycles/:cycleId/events/:eventId/edit', () => {
  it('retimes the Event, its kept blocks and their Shifts, adds a block and keeps Assignments with their UnavailableShifts and open SwapRequests', async () => {
    const seed = await signIn();
    const churchId = seed.churchAId;
    const { cycle, sunday, media, ana } = await seedStaffedSunday({
      churchId,
      ministryId: seed.ministryAId,
    });
    // A first-half Shift of Media, unassigned: it keeps its share.
    const firstHalf = await buildShift({
      db,
      churchId,
      participationId: media.assignment.participationId,
      eventTimeBlockId: media.eventTimeBlock.id,
      start: inst(at('10:00')),
      end: inst(at('11:00')),
      label: 'First half',
    });
    const membership = await buildMinistryMembership({
      db,
      churchId,
      volunteerId: ana.id,
      ministryId: seed.ministryAId,
      ministryAccessLevel: 'volunteer',
      roleIds: [],
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
      shiftId: media.shift.id,
    });
    await db.insert(swapRequest).values({
      churchId,
      assignmentId: media.assignment.id,
      status: 'open',
      raisedBy: 'user-ana',
    });
    const assignmentsBefore = await db.select().from(assignment);
    const unavailableBefore = await db.select().from(unavailableShift);
    const snapshotsBefore = await db.select().from(scheduleLastTold);
    const body = currentBody(sunday);

    // Media 10–12 → 10–12:30 stays clear of Ana's 13–14 and Bia's 14–15.
    const response = await apply({
      cycleId: cycle.id,
      eventId: sunday.event.id,
      body: {
        start: at('09:00'),
        end: at('13:00'),
        eventTimeBlocks: [
          ...body.eventTimeBlocks,
          {
            id: media.eventTimeBlock.id,
            label: 'Media',
            startTime: at('10:00'),
            endTime: at('12:30'),
          },
          { label: 'Lunch', startTime: at('12:00'), endTime: at('13:00') },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const result = response.json();
    expect(result.event).toMatchObject({
      id: sunday.event.id,
      start: at('09:00'),
      end: at('13:00'),
    });
    expect(result.withdrawn).toEqual([]);
    const blocks = Object.fromEntries(
      result.eventTimeBlocks.map(
        (block: { label: string; startTime: string; endTime: string }) => [
          block.label,
          [block.startTime, block.endTime],
        ],
      ),
    );
    expect(blocks).toEqual({
      Welcome: [at('09:00'), at('10:00')],
      Service: [at('10:00'), at('12:00')],
      Media: [at('10:00'), at('12:30')],
      Lunch: [at('12:00'), at('13:00')],
    });
    const shiftBounds = async (id: string) =>
      boundsOf((await db.select().from(shift).where(eq(shift.id, id)))[0]);
    expect(await shiftBounds(media.shift.id)).toEqual([
      at('10:00'),
      at('12:30'),
    ]);
    expect(await shiftBounds(firstHalf.id)).toEqual([at('10:00'), at('11:15')]);
    // The added block is staffed like any new block: one Shift per Ministry.
    const lunch = result.eventTimeBlocks.find(
      (block: { label: string }) => block.label === 'Lunch',
    );
    const lunchShifts = await db
      .select()
      .from(shift)
      .where(eq(shift.eventTimeBlockId, lunch.id));
    expect(lunchShifts.map(boundsOf)).toEqual([[at('12:00'), at('13:00')]]);
    expect(await db.select().from(assignment)).toEqual(assignmentsBefore);
    expect(await db.select().from(unavailableShift)).toEqual(unavailableBefore);
    const [swap] = await db.select().from(swapRequest);
    expect(swap?.status).toBe('open');
    // Only the retimed block is recorded; Send updates tells Volunteers.
    expect(
      (await db.select().from(eventTimeBlockMove)).map((row) => ({
        eventTimeBlockId: row.eventTimeBlockId,
        previous: [
          row.previousStart.toISOString(),
          row.previousEnd.toISOString(),
        ],
        next: [row.newStart.toISOString(), row.newEnd.toISOString()],
      })),
    ).toEqual([
      {
        eventTimeBlockId: media.eventTimeBlock.id,
        previous: [at('10:00'), at('12:00')],
        next: [at('10:00'), at('12:30')],
      },
    ]);
    expect(await db.select().from(scheduleLastTold)).toEqual(snapshotsBefore);
  });

  it('extends an Event that is running', async () => {
    const seed = await signIn();
    const cycle = await seedCycle({ churchId: seed.churchAId, state: 'sent' });
    const sunday = await seedScheduledEvent({
      churchId: seed.churchAId,
      cycleId: cycle.id,
    });
    setTestClock({ instant: inst(at('11:00')) });
    const body = currentBody(sunday);

    const response = await apply({
      cycleId: cycle.id,
      eventId: sunday.event.id,
      body: {
        ...body,
        end: at('14:00'),
        eventTimeBlocks: body.eventTimeBlocks.map((block) =>
          block.label === 'Service'
            ? { ...block, endTime: at('14:00') }
            : block,
        ),
      },
    });

    expect(response.statusCode).toBe(200);
    const [stored] = await db
      .select()
      .from(event)
      .where(eq(event.id, sunday.event.id));
    expect(stored?.end.toISOString()).toBe(at('14:00'));
    const [service] = await db
      .select()
      .from(eventTimeBlock)
      .where(eq(eventTimeBlock.id, sunday.service.id));
    expect(boundsOf(service)).toEqual([at('10:00'), at('14:00')]);
  });

  it('keeps the past of a running block: an ended Shift stays, a running one keeps its start, the rest follows', async () => {
    const seed = await signIn();
    const churchId = seed.churchAId;
    const cycle = await seedCycle({ churchId, state: 'sent' });
    const sunday = await seedScheduledEvent({ churchId, cycleId: cycle.id });
    const participation = await buildMinistryParticipation({
      db,
      churchId,
      ministryId: seed.ministryAId,
      eventId: sunday.event.id,
      state: 'preparing',
      eventTimeBlockIds: [],
    });
    const serviceShift = (start: string, end: string) =>
      buildShift({
        db,
        churchId,
        participationId: participation.id,
        eventTimeBlockId: sunday.service.id,
        start: inst(at(start)),
        end: inst(at(end)),
        label: start,
      });
    const ended = await serviceShift('10:00', '11:00');
    const running = await serviceShift('11:00', '11:45');
    const upcoming = await serviceShift('11:45', '12:00');
    setTestClock({ instant: inst(at('11:30')) });
    const body = currentBody(sunday);

    // Service 10–12 → 10–14: the rest of it, 11:30–12, becomes 11:30–14.
    const response = await apply({
      cycleId: cycle.id,
      eventId: sunday.event.id,
      body: {
        ...body,
        end: at('14:00'),
        eventTimeBlocks: body.eventTimeBlocks.map((block) =>
          block.label === 'Service'
            ? { ...block, endTime: at('14:00') }
            : block,
        ),
      },
    });

    expect(response.statusCode).toBe(200);
    const shiftBounds = async (id: string) =>
      boundsOf((await db.select().from(shift).where(eq(shift.id, id)))[0]);
    expect(await shiftBounds(ended.id)).toEqual([at('10:00'), at('11:00')]);
    expect(await shiftBounds(running.id)).toEqual([at('11:00'), at('12:45')]);
    expect(await shiftBounds(upcoming.id)).toEqual([at('12:45'), at('14:00')]);
  });

  it('refuses an Event that has ended with EDIT_WINDOW_CLOSED and writes nothing', async () => {
    const seed = await signIn();
    const cycle = await seedCycle({ churchId: seed.churchAId, state: 'sent' });
    const sunday = await seedScheduledEvent({
      churchId: seed.churchAId,
      cycleId: cycle.id,
    });
    setTestClock({ instant: inst(at('12:00')) });
    const before = await writeSnapshot();

    const response = await apply({
      cycleId: cycle.id,
      eventId: sunday.event.id,
      body: { ...currentBody(sunday), end: at('13:00') },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'EDIT_WINDOW_CLOSED' });
    expect(await writeSnapshot()).toEqual(before);
  });

  it('recalculates over a stale preview and withdraws only the actual clashes, auditing them and closing their open SwapRequests as covered', async () => {
    const seed = await signIn();
    const churchId = seed.churchAId;
    const { cycle, sunday, media, ana } = await seedStaffedSunday({
      churchId,
      ministryId: seed.ministryAId,
    });
    const [bia] = await db
      .select()
      .from(assignment)
      .where(eq(assignment.shiftId, media.shift.id))
      .then((rows) => rows.filter(({ volunteerId }) => volunteerId !== ana.id));
    if (!bia) throw new Error('Bia is not on Media');
    const body = currentBody(sunday);
    // Media 10–12 → 10–14: Ana (13–14 elsewhere) clashes; Bia (14–15) touches.
    const edit: EditBody = {
      ...body,
      end: at('14:00'),
      eventTimeBlocks: [
        ...body.eventTimeBlocks,
        {
          id: media.eventTimeBlock.id,
          label: 'Media',
          startTime: at('10:00'),
          endTime: at('14:00'),
        },
      ],
    };
    const stale = await preview({
      cycleId: cycle.id,
      eventId: sunday.event.id,
      body: edit,
    });
    // Booked after the preview: Bia now serves another Event 13:30–14:30.
    const late = await seedScheduledEvent({
      churchId,
      cycleId: cycle.id,
      title: 'Late',
      start: at('13:30'),
      end: at('16:00'),
    });
    const role = await buildRole({
      db,
      churchId,
      ministryId: seed.ministryAId,
      name: 'Greeter',
    });
    const lateParticipation = await buildMinistryParticipation({
      db,
      churchId,
      ministryId: seed.ministryAId,
      eventId: late.event.id,
      state: 'preparing',
      eventTimeBlockIds: [],
    });
    await book({
      churchId,
      eventId: late.event.id,
      participationId: lateParticipation.id,
      roleId: role.id,
      volunteerId: bia.volunteerId,
      status: 'confirmed',
      start: at('13:30'),
      end: at('14:30'),
    });
    for (const [assignmentId, raisedBy] of [
      [media.assignment.id, 'user-ana'],
      [bia.id, 'user-bia'],
    ] as const) {
      await db
        .insert(swapRequest)
        .values({ churchId, assignmentId, status: 'open', raisedBy });
    }

    const response = await apply({
      cycleId: cycle.id,
      eventId: sunday.event.id,
      body: edit,
    });

    expect(
      stale
        .json()
        .clashes.map(
          ({ assignmentId }: { assignmentId: string }) => assignmentId,
        ),
    ).toEqual([media.assignment.id]);
    expect(response.statusCode).toBe(200);
    const withdrawn = [media.assignment.id, bia.id].sort();
    expect(
      response
        .json()
        .withdrawn.map(
          ({ assignmentId }: { assignmentId: string }) => assignmentId,
        )
        .sort(),
    ).toEqual(withdrawn);
    expect(
      await db
        .select()
        .from(assignment)
        .where(inArray(assignment.id, withdrawn)),
    ).toEqual([]);
    const audits = await db
      .select()
      .from(assignmentAudit)
      .where(inArray(assignmentAudit.assignmentId, withdrawn));
    expect(
      audits.map(({ assignmentId, action, actorId }) => ({
        assignmentId,
        action,
        actorId,
      })),
    ).toEqual(
      expect.arrayContaining(
        withdrawn.map((assignmentId) => ({
          assignmentId,
          action: 'deleted',
          actorId: seed.adminUserId,
        })),
      ),
    );
    expect(audits).toHaveLength(2);
    const swaps = await db.select().from(swapRequest);
    expect(swaps.map(({ status, closedBy }) => ({ status, closedBy }))).toEqual(
      [
        { status: 'covered', closedBy: seed.adminUserId },
        { status: 'covered', closedBy: seed.adminUserId },
      ],
    );
  });

  it('enqueues one N10 change row per affected leader with the old and new Event bounds', async () => {
    const seed = await signIn();
    const { cycle, sunday, media } = await seedStaffedSunday({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
    });
    const body = currentBody(sunday);

    const response = await apply({
      cycleId: cycle.id,
      eventId: sunday.event.id,
      body: {
        ...body,
        end: at('12:30'),
        eventTimeBlocks: [
          ...body.eventTimeBlocks,
          {
            id: media.eventTimeBlock.id,
            label: 'Media',
            startTime: at('10:00'),
            endTime: at('12:30'),
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const rows = await db.select().from(outboxMessage);
    expect(rows.map(({ payload }) => payload)).toEqual([
      expect.objectContaining({
        kind: 'event_changed',
        to: expect.objectContaining({ userId: seed.adminUserId }),
        data: expect.objectContaining({
          cycleId: cycle.id,
          eventId: sunday.event.id,
          eventTitle: 'Sunday',
          ministries: [{ id: seed.ministryAId, name: 'Scheduling Ministry A' }],
          change: {
            kind: 'move',
            previousStart: at('09:00'),
            previousEnd: at('12:00'),
            start: at('09:00'),
            end: at('12:30'),
            volunteerCount: 2,
            impacts: [
              {
                ministryId: seed.ministryAId,
                ministryName: 'Scheduling Ministry A',
                volunteerCount: 2,
                answersGiven: false,
              },
            ],
          },
        }),
      }),
    ]);
  });

  it('cancels a dropped unstaffed block, keeping it visible as cancelled', async () => {
    const seed = await signIn();
    const cycle = await seedCycle({ churchId: seed.churchAId, state: 'sent' });
    const sunday = await seedScheduledEvent({
      churchId: seed.churchAId,
      cycleId: cycle.id,
    });
    const body = currentBody(sunday);

    const response = await apply({
      cycleId: cycle.id,
      eventId: sunday.event.id,
      body: {
        ...body,
        start: at('10:00'),
        eventTimeBlocks: body.eventTimeBlocks.filter(
          ({ label }) => label === 'Service',
        ),
      },
    });

    expect(response.statusCode).toBe(200);
    const stored = await db
      .select()
      .from(eventTimeBlock)
      .where(eq(eventTimeBlock.eventId, sunday.event.id));
    expect(
      Object.fromEntries(stored.map(({ label, status }) => [label, status])),
    ).toEqual({ Welcome: 'cancelled', Service: 'active' });
  });

  it.each([
    [
      'a staffed block left out',
      'staffed',
      409,
      'STAFFED_EVENT_TIME_BLOCK_DROP',
    ],
    ['a block outside the Event bounds', 'outside', 422, 'VALIDATION_ERROR'],
  ] as const)('refuses %s and writes nothing', async (_name, kind, status, error) => {
    const seed = await signIn();
    const { cycle, sunday } = await seedStaffedSunday({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
    });
    const before = await writeSnapshot();
    const body = currentBody(sunday);

    const response = await apply({
      cycleId: cycle.id,
      eventId: sunday.event.id,
      body: kind === 'staffed' ? body : { ...body, end: at('11:00') },
    });

    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ error });
    expect(await writeSnapshot()).toEqual(before);
  });

  it('keeps wall-clock times for a multi-day edit across a DST change', async () => {
    const seed = await signIn();
    const churchId = seed.churchAId;
    // Lisbon leaves summer time (UTC+1) for UTC+0 at 02:00 on 25 October.
    const timeZone = 'Europe/Lisbon';
    await db
      .update(church)
      .set({ timezone: timeZone })
      .where(eq(church.id, churchId));
    const lisbon = (day: string, time: string) =>
      toInstant({
        day: parseCalendarDay({ value: day }),
        time: parseTimeOfDay({ value: time }),
        timeZone,
      });
    const cycle = await seedCycle({ churchId, state: 'sent' });
    const vigil = await buildEvent({
      db,
      churchId,
      cycleId: cycle.id,
      title: 'Vigil',
      start: inst(lisbon('2026-10-24', '18:00')),
      end: inst(lisbon('2026-10-25', '12:00')),
      status: 'scheduled',
    });
    const saturday = await buildEventTimeBlock({
      db,
      churchId,
      eventId: vigil.id,
      start: inst(lisbon('2026-10-24', '18:00')),
      end: inst(lisbon('2026-10-24', '20:00')),
      label: 'Saturday',
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
      eventId: vigil.id,
      state: 'preparing',
      eventTimeBlockIds: [],
    });
    const ana = await seedVolunteer({ churchId, name: 'ana' });
    const sunday = await book({
      churchId,
      eventId: vigil.id,
      participationId: participation.id,
      roleId: role.id,
      volunteerId: ana.id,
      status: 'confirmed',
      start: lisbon('2026-10-25', '10:00'),
      end: lisbon('2026-10-25', '12:00'),
    });
    await db
      .update(eventTimeBlock)
      .set({ label: 'Sunday' })
      .where(eq(eventTimeBlock.id, sunday.eventTimeBlock.id));

    // One more wall-clock hour at the end of each day.
    const response = await apply({
      cycleId: cycle.id,
      eventId: vigil.id,
      body: {
        start: lisbon('2026-10-24', '18:00'),
        end: lisbon('2026-10-25', '13:00'),
        eventTimeBlocks: [
          {
            id: saturday.id,
            label: 'Saturday',
            startTime: lisbon('2026-10-24', '18:00'),
            endTime: lisbon('2026-10-24', '21:00'),
          },
          {
            id: sunday.eventTimeBlock.id,
            label: 'Sunday',
            startTime: lisbon('2026-10-25', '10:00'),
            endTime: lisbon('2026-10-25', '13:00'),
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const blocks = await db
      .select()
      .from(eventTimeBlock)
      .where(eq(eventTimeBlock.eventId, vigil.id));
    expect(
      Object.fromEntries(blocks.map((block) => [block.label, boundsOf(block)])),
    ).toEqual({
      Saturday: ['2026-10-24T17:00:00.000Z', '2026-10-24T20:00:00.000Z'],
      Sunday: ['2026-10-25T10:00:00.000Z', '2026-10-25T13:00:00.000Z'],
    });
    const [served] = await db
      .select()
      .from(shift)
      .where(eq(shift.id, sunday.shift.id));
    expect(boundsOf(served)).toEqual([
      '2026-10-25T10:00:00.000Z',
      '2026-10-25T13:00:00.000Z',
    ]);
  });

  it('answers 404 across Churches and writes nothing', async () => {
    const seed = await signIn();
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
    const before = await writeSnapshot();

    const crossChurch = await apply({
      cycleId: foreignCycle.id,
      eventId: foreign.event.id,
      body: { ...currentBody(foreign), end: at('13:00') },
    });

    expect(crossChurch.statusCode).toBe(404);
    expect(await writeSnapshot()).toEqual(before);
  });

  it('answers 403 to a non-admin', async () => {
    const seed = await signIn({ persona: 'member' });
    const cycle = await seedCycle({ churchId: seed.churchAId, state: 'sent' });
    const sunday = await seedScheduledEvent({
      churchId: seed.churchAId,
      cycleId: cycle.id,
    });
    const before = await writeSnapshot();

    const response = await apply({
      cycleId: cycle.id,
      eventId: sunday.event.id,
      body: currentBody(sunday),
    });

    expect(response.statusCode).toBe(403);
    expect(await writeSnapshot()).toEqual(before);
  });
});
