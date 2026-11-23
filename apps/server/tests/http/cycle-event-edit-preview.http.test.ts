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
  type SeededCycleLifecycle,
} from '@/seeds/builders/scheduling';
import { buildVolunteer } from '@/seeds/builders/volunteer';
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
