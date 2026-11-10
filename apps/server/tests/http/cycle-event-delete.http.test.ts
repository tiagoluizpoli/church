import {
  event,
  eventTimeBlock,
  ministryParticipation,
  outboxMessage,
  shift,
} from '@church/db';
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
import {
  buildCycle,
  buildEvent,
  buildEventTimeBlock,
  buildMinistryParticipation,
  buildShift,
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
  startDate?: string;
  endDate?: string;
}

function seedCycle({
  churchId,
  state = 'draft',
  startDate = CYCLE_START,
  endDate = CYCLE_END,
}: SeedCycleInput) {
  return buildCycle({
    db,
    churchId,
    name: 'October',
    state,
    startDate: parseCalendarDay({ value: startDate }),
    endDate: parseCalendarDay({ value: endDate }),
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

interface DeleteEventInput {
  cycleId: string;
  eventId: string;
}

function deleteEvent({ cycleId, eventId }: DeleteEventInput) {
  return app.inject({
    method: 'DELETE',
    url: `/api/v1/admin/cycles/${cycleId}/events/${eventId}`,
  });
}

/** Sunday 2026-10-18 in São Paulo. */
const at = (time: string) => local({ day: '2026-10-18', time });

interface SeedEventInput {
  churchId: string;
  ministryId: string;
  cycleId: string;
  status?: 'draft' | 'scheduled';
}

/** An Event with a block, a Participation and a Shift on it. */
async function seedEvent({
  churchId,
  ministryId,
  cycleId,
  status = 'draft',
}: SeedEventInput) {
  const row = await buildEvent({
    db,
    churchId,
    cycleId,
    title: 'Sunday',
    start: parseInstant({ value: at('09:00') }),
    end: parseInstant({ value: at('12:00') }),
    status,
  });
  const block = await buildEventTimeBlock({
    db,
    churchId,
    eventId: row.id,
    start: parseInstant({ value: at('09:00') }),
    end: parseInstant({ value: at('12:00') }),
    label: 'Service',
  });
  const participation = await buildMinistryParticipation({
    db,
    churchId,
    ministryId,
    eventId: row.id,
    state: 'preparing',
    eventTimeBlockIds: [block.id],
  });
  await buildShift({
    db,
    churchId,
    participationId: participation.id,
    eventTimeBlockId: block.id,
    start: parseInstant({ value: at('09:00') }),
    end: parseInstant({ value: at('12:00') }),
  });
  return { eventId: row.id };
}

async function counts() {
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

async function setUp() {
  const seed = await signIn();
  const target = await seedCycle({ churchId: seed.churchAId });
  const fixture = await seedEvent({
    churchId: seed.churchAId,
    ministryId: seed.ministryAId,
    cycleId: target.id,
  });
  const sibling = await seedEvent({
    churchId: seed.churchAId,
    ministryId: seed.ministryAId,
    cycleId: target.id,
  });
  return { seed, cycleId: target.id, fixture, sibling };
}

describe('DELETE /admin/cycles/:cycleId/events/:eventId', () => {
  it('returns 204, cascades the draft data, spares siblings and enqueues nothing', async () => {
    const { cycleId, fixture, sibling } = await setUp();
    expect(await counts()).toEqual({
      events: 2,
      eventTimeBlocks: 2,
      participations: 2,
      shifts: 2,
      outbox: 0,
    });

    const response = await deleteEvent({ cycleId, eventId: fixture.eventId });

    expect(response.statusCode).toBe(204);
    expect(await counts()).toEqual({
      events: 1,
      eventTimeBlocks: 1,
      participations: 1,
      shifts: 1,
      outbox: 0,
    });
    const rest = await db.select().from(event);
    expect(rest.map(({ id }) => id)).toEqual([sibling.eventId]);
  });

  it('rolls everything back when the delete fails', async () => {
    const { cycleId, fixture } = await setUp();
    const before = await counts();
    vi.spyOn(
      DrizzlePlanningEventRepository.prototype,
      'deleteEvent',
    ).mockRejectedValue(new Error('delete failed'));

    const response = await deleteEvent({ cycleId, eventId: fixture.eventId });

    expect(response.statusCode).toBe(500);
    expect(await counts()).toEqual(before);
  });

  it('returns 409 for a Sent Cycle with a reopened draft Event and for a Past Cycle', async () => {
    const seed = await signIn();
    for (const state of ['sent', 'past'] as const) {
      const target = await seedCycle({
        churchId: seed.churchAId,
        state,
        ...(state === 'past'
          ? { startDate: '2026-08-01', endDate: '2026-08-14' }
          : {}),
      });
      const fixture = await seedEvent({
        churchId: seed.churchAId,
        ministryId: seed.ministryAId,
        cycleId: target.id,
      });
      const before = await counts();

      const response = await deleteEvent({
        cycleId: target.id,
        eventId: fixture.eventId,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe('ILLEGAL_STATE_TRANSITION');
      expect(await counts()).toEqual(before);
    }
  });

  it('returns 409 for a non-draft Event', async () => {
    const seed = await signIn();
    const target = await seedCycle({ churchId: seed.churchAId });
    const fixture = await seedEvent({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      cycleId: target.id,
      status: 'scheduled',
    });

    const response = await deleteEvent({
      cycleId: target.id,
      eventId: fixture.eventId,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('ILLEGAL_STATE_TRANSITION');
    expect((await counts()).events).toBe(1);
  });

  it('returns the same 404 for a missing, foreign or wrong-Cycle Event', async () => {
    const { seed, cycleId, fixture } = await setUp();
    const otherCycle = await seedCycle({
      churchId: seed.churchAId,
      startDate: '2026-11-02',
      endDate: '2026-11-15',
    });
    const foreignCycle = await seedCycle({ churchId: seed.churchBId });
    const foreign = await seedEvent({
      churchId: seed.churchBId,
      ministryId: seed.ministryBId,
      cycleId: foreignCycle.id,
    });
    const before = await counts();

    const responses = await Promise.all([
      deleteEvent({
        cycleId,
        eventId: '00000000-0000-4000-8000-000000000000',
      }),
      deleteEvent({ cycleId, eventId: foreign.eventId }),
      deleteEvent({ cycleId: foreignCycle.id, eventId: foreign.eventId }),
      deleteEvent({ cycleId: otherCycle.id, eventId: fixture.eventId }),
    ]);

    expect(responses.map(({ statusCode }) => statusCode)).toEqual([
      404, 404, 404, 404,
    ]);
    expect(
      new Set(responses.map(({ body }) => body.replace(/[0-9a-f-]{36}/g, '')))
        .size,
    ).toBe(1);
    expect(await counts()).toEqual(before);
  });

  it('returns 403 without the ChurchAdmin capability and 401 signed out', async () => {
    const seed = await signIn({ persona: 'member' });
    const target = await seedCycle({ churchId: seed.churchAId });
    const fixture = await seedEvent({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      cycleId: target.id,
    });
    const args = { cycleId: target.id, eventId: fixture.eventId };
    const member = await deleteEvent(args);
    mockGetSession.mockResolvedValue(null as never);
    const signedOut = await deleteEvent(args);

    expect(member.statusCode).toBe(403);
    expect(signedOut.statusCode).toBe(401);
    expect((await counts()).events).toBe(1);
  });
});
