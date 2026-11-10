import { randomUUID } from 'node:crypto';
import { event, eventTimeBlock, shift } from '@church/db';
import {
  parseCalendarDay,
  parseInstant,
  parseTimeOfDay,
  resetClock,
  setTestClock,
} from '@church/time';
import { eq, sql } from 'drizzle-orm';
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
import { buildEventTemplate } from '@/seeds/builders/planning';
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
const cycleRepository = new DrizzleCycleRepository({ db });

/** Church A is America/Sao_Paulo (UTC-3, no DST). */
const CHURCH_OCTOBER_1_NOON = '2026-10-01T15:00:00.000Z';

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

interface SeedCycleInput {
  churchId: string;
  startDate: string;
  endDate: string;
  state?: 'draft' | 'sent' | 'past';
}

function seedCycle({ state = 'draft', ...input }: SeedCycleInput) {
  return buildCycle({
    db,
    name: 'Seeded',
    state,
    ...input,
    startDate: parseCalendarDay({ value: input.startDate }),
    endDate: parseCalendarDay({ value: input.endDate }),
  });
}

const time = (value: string) => parseTimeOfDay({ value });

interface TemplateInput {
  churchId: string;
  name?: string;
  weekday?: number;
  blocks?: { label: string; start: string; end: string }[];
}

/** Sunday by default, with one 19:00–21:00 block. */
async function seedTemplate({
  churchId,
  name = 'Sunday',
  weekday = 0,
  blocks = [{ label: 'Service', start: '19:00', end: '21:00' }],
}: TemplateInput) {
  return buildEventTemplate({
    db,
    churchId,
    name,
    weekday,
    blocks: blocks.map((block) => ({
      label: block.label,
      startTime: time(block.start),
      endTime: time(block.end),
    })),
  });
}

function apply(cycleId: string, templateIds: string[]) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/admin/cycles/${cycleId}/apply-templates`,
    payload: { templateIds },
  });
}

async function storedEvents(cycleId: string) {
  const rows = await db
    .select()
    .from(event)
    .where(eq(event.cycleId, cycleId))
    .orderBy(event.start);
  return rows.map((row) => ({
    id: row.id,
    start: row.start.toISOString(),
    end: row.end.toISOString(),
  }));
}

async function storedBlocks(cycleId: string) {
  const rows = await db
    .select({
      id: eventTimeBlock.id,
      eventId: eventTimeBlock.eventId,
      label: eventTimeBlock.label,
      source: eventTimeBlock.sourceTemplateTimeBlockId,
      start: eventTimeBlock.startTime,
      end: eventTimeBlock.endTime,
    })
    .from(eventTimeBlock)
    .innerJoin(event, eq(event.id, eventTimeBlock.eventId))
    .where(eq(event.cycleId, cycleId))
    .orderBy(eventTimeBlock.startTime, eventTimeBlock.label);
  return rows.map((row) => ({
    ...row,
    start: row.start.toISOString(),
    end: row.end.toISOString(),
  }));
}

/** Monday 12 – Sunday 25 October 2026: two Sundays, 18th and 25th. */
const FORTNIGHT = { startDate: '2026-10-12', endDate: '2026-10-25' };
const TWO_SUNDAYS = { generatedEventCount: 2, generatedEventTimeBlockCount: 2 };
const NOTHING = { generatedEventCount: 0, generatedEventTimeBlockCount: 0 };

describe('POST /admin/cycles/:cycleId/apply-templates', () => {
  it('adds one Event per selected template and matching day, then reports a no-op', async () => {
    const seed = await signIn();
    const sunday = await seedTemplate({ churchId: seed.churchAId });
    const cycle = await seedCycle({ churchId: seed.churchAId, ...FORTNIGHT });

    const first = await apply(cycle.id, [sunday.template.id]);
    const again = await apply(cycle.id, [sunday.template.id]);

    expect(first.statusCode).toBe(201);
    expect(first.json()).toEqual(TWO_SUNDAYS);
    expect(again.json()).toEqual(NOTHING);
    expect(await storedEvents(cycle.id)).toHaveLength(2);
  });

  it('includes both bounds and ignores nonmatching days', async () => {
    const seed = await signIn();
    const sunday = await seedTemplate({ churchId: seed.churchAId });
    // Sunday 18 – Sunday 25 includes both Sundays; Monday 19 – Saturday 24 none.
    const bounds = await seedCycle({
      churchId: seed.churchAId,
      startDate: '2026-10-18',
      endDate: '2026-10-25',
    });
    const between = await seedCycle({
      churchId: seed.churchAId,
      startDate: '2026-11-02',
      endDate: '2026-11-07',
    });

    expect((await apply(bounds.id, [sunday.template.id])).json()).toEqual(
      TWO_SUNDAYS,
    );
    expect((await apply(between.id, [sunday.template.id])).json()).toEqual(
      NOTHING,
    );
  });

  it('deduplicates repeated ids and lets templates share a weekday', async () => {
    const seed = await signIn();
    const early = await seedTemplate({
      churchId: seed.churchAId,
      name: 'Early',
    });
    const late = await seedTemplate({
      churchId: seed.churchAId,
      name: 'Late',
      blocks: [{ label: 'Late', start: '20:00', end: '22:00' }],
    });
    const cycle = await seedCycle({ churchId: seed.churchAId, ...FORTNIGHT });

    const response = await apply(cycle.id, [
      early.template.id,
      late.template.id,
      early.template.id,
    ]);

    expect(response.json()).toEqual({
      generatedEventCount: 4,
      generatedEventTimeBlockCount: 4,
    });
  });

  it('refuses an empty selection with VALIDATION_ERROR', async () => {
    const seed = await signIn();
    const cycle = await seedCycle({ churchId: seed.churchAId, ...FORTNIGHT });

    const response = await apply(cycle.id, []);

    expect(response.statusCode).toBe(422);
    expect(response.json().error).toBe('VALIDATION_ERROR');
  });

  it('fails a mixed valid, missing and foreign selection with 404 and writes nothing', async () => {
    const seed = await signIn();
    const sunday = await seedTemplate({ churchId: seed.churchAId });
    const foreign = await seedTemplate({ churchId: seed.churchBId });
    const cycle = await seedCycle({ churchId: seed.churchAId, ...FORTNIGHT });

    for (const stranger of [randomUUID(), foreign.template.id, 'not-a-uuid']) {
      const response = await apply(cycle.id, [sunday.template.id, stranger]);
      expect(response.statusCode).toBe(404);
    }
    expect(await storedEvents(cycle.id)).toEqual([]);
  });

  it.each([
    'sent',
    'past',
  ] as const)('refuses a %s Cycle with ILLEGAL_STATE_TRANSITION', async (state) => {
    const seed = await signIn();
    const sunday = await seedTemplate({ churchId: seed.churchAId });
    const cycle = await seedCycle({
      churchId: seed.churchAId,
      state,
      ...FORTNIGHT,
    });

    const response = await apply(cycle.id, [sunday.template.id]);

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('ILLEGAL_STATE_TRANSITION');
    expect(await storedEvents(cycle.id)).toEqual([]);
  });

  it('refuses a Draft whose last day has elapsed', async () => {
    const seed = await signIn();
    const sunday = await seedTemplate({ churchId: seed.churchAId });
    const cycle = await seedCycle({
      churchId: seed.churchAId,
      startDate: '2026-09-07',
      endDate: '2026-09-20',
    });

    const response = await apply(cycle.id, [sunday.template.id]);

    expect(response.statusCode).toBe(409);
  });

  it('keeps retimed blocks, adds only missing blocks and never matches by name', async () => {
    const seed = await signIn();
    const sunday = await seedTemplate({
      churchId: seed.churchAId,
      blocks: [
        { label: 'Service', start: '19:00', end: '21:00' },
        { label: 'Prayer', start: '18:00', end: '18:30' },
      ],
    });
    const cycle = await seedCycle({ churchId: seed.churchAId, ...FORTNIGHT });
    await apply(cycle.id, [sunday.template.id]);
    const [firstEvent] = await storedEvents(cycle.id);
    const before = await storedBlocks(cycle.id);
    const prayer = before.find(
      (block) => block.label === 'Prayer' && block.eventId === firstEvent?.id,
    );
    const service = before.find(
      (block) => block.label === 'Service' && block.eventId === firstEvent?.id,
    );
    // Retime and rename the Service copy; hard-delete the Prayer copy.
    await db
      .update(eventTimeBlock)
      .set({
        label: 'Renamed',
        startTime: new Date('2026-10-19T00:30:00Z'),
        endTime: new Date('2026-10-19T01:00:00Z'),
      })
      .where(eq(eventTimeBlock.id, service?.id ?? ''));
    await db
      .delete(eventTimeBlock)
      .where(eq(eventTimeBlock.id, prayer?.id ?? ''));

    const response = await apply(cycle.id, [sunday.template.id]);
    const after = await storedBlocks(cycle.id);

    expect(response.json()).toEqual({
      generatedEventCount: 0,
      generatedEventTimeBlockCount: 1,
    });
    expect(after).toHaveLength(before.length);
    const kept = after.find((block) => block.id === service?.id);
    expect(kept).toMatchObject({
      label: 'Renamed',
      start: '2026-10-19T00:30:00.000Z',
    });
    expect(after.find((block) => block.id === prayer?.id)).toBeUndefined();
  });

  it('recreates a hard-deleted occurrence but never revives a cancelled one', async () => {
    const seed = await signIn();
    const sunday = await seedTemplate({ churchId: seed.churchAId });
    const cycle = await seedCycle({ churchId: seed.churchAId, ...FORTNIGHT });
    await apply(cycle.id, [sunday.template.id]);
    const [deleted, cancelled] = await storedEvents(cycle.id);
    await db.delete(event).where(eq(event.id, deleted?.id ?? ''));
    await db
      .update(event)
      .set({ status: 'cancelled' })
      .where(eq(event.id, cancelled?.id ?? ''));

    const response = await apply(cycle.id, [sunday.template.id]);
    const events = await storedEvents(cycle.id);

    expect(response.json()).toEqual({
      generatedEventCount: 1,
      generatedEventTimeBlockCount: 1,
    });
    expect(events).toHaveLength(2);
    expect(events.map((row) => row.id)).toContain(cancelled?.id);
    expect(events.map((row) => row.id)).not.toContain(deleted?.id);
    const [stillCancelled] = await db
      .select()
      .from(event)
      .where(eq(event.id, cancelled?.id ?? ''));
    expect(stillCancelled?.status).toBe('cancelled');
  });

  it('contains every block in the Event, including an overnight block on the last day', async () => {
    const seed = await signIn();
    const vigil = await seedTemplate({
      churchId: seed.churchAId,
      name: 'Vigil',
      blocks: [
        { label: 'Overnight', start: '20:00', end: '04:00' },
        { label: 'Short', start: '21:00', end: '22:00' },
      ],
    });
    const cycle = await seedCycle({
      churchId: seed.churchAId,
      startDate: '2026-10-25',
      endDate: '2026-10-25',
    });

    const response = await apply(cycle.id, [vigil.template.id]);
    const [generated] = await storedEvents(cycle.id);

    expect(response.json()).toEqual({
      generatedEventCount: 1,
      generatedEventTimeBlockCount: 2,
    });
    // Overnight ends 04:00 on the 26th, after the later-starting block.
    expect(generated).toMatchObject({
      start: '2026-10-25T23:00:00.000Z',
      end: '2026-10-26T07:00:00.000Z',
    });
  });

  it('expands an existing Event only as far as appended blocks need', async () => {
    const seed = await signIn();
    const sunday = await seedTemplate({
      churchId: seed.churchAId,
      blocks: [{ label: 'Service', start: '19:00', end: '21:00' }],
    });
    const cycle = await seedCycle({
      churchId: seed.churchAId,
      startDate: '2026-10-18',
      endDate: '2026-10-18',
    });
    await apply(cycle.id, [sunday.template.id]);
    const [original] = await storedEvents(cycle.id);
    // The template later gains an early and an overnight block.
    await db.execute(sql`
      INSERT INTO template_time_block (church_id, template_id, label, start_time, end_time, "order")
      VALUES (${seed.churchAId}, ${sunday.template.id}, 'Early', '08:00', '09:00', 1),
             (${seed.churchAId}, ${sunday.template.id}, 'Night', '22:00', '03:00', 2)`);

    const response = await apply(cycle.id, [sunday.template.id]);
    const [expanded] = await storedEvents(cycle.id);

    expect(response.json()).toEqual({
      generatedEventCount: 0,
      generatedEventTimeBlockCount: 2,
    });
    expect(expanded?.id).toBe(original?.id);
    expect(expanded).toMatchObject({
      start: '2026-10-18T11:00:00.000Z',
      end: '2026-10-19T06:00:00.000Z',
    });
  });

  it('creates calendar copies only: no staffing', async () => {
    const seed = await signIn();
    const sunday = await seedTemplate({ churchId: seed.churchAId });
    const cycle = await seedCycle({ churchId: seed.churchAId, ...FORTNIGHT });

    await apply(cycle.id, [sunday.template.id]);

    expect(await db.select().from(shift)).toEqual([]);
    const events = await db
      .select()
      .from(event)
      .where(eq(event.cycleId, cycle.id));
    expect(events.every((row) => row.status === 'draft')).toBe(true);
  });

  it('rolls back every write when a later insertion fails', async () => {
    const seed = await signIn();
    const sunday = await seedTemplate({ churchId: seed.churchAId });
    const doomed = await seedTemplate({
      churchId: seed.churchAId,
      name: 'Doomed',
      weekday: 1,
      blocks: [{ label: 'Boom', start: '10:00', end: '11:00' }],
    });
    const cycle = await seedCycle({ churchId: seed.churchAId, ...FORTNIGHT });
    await db.execute(sql`
      CREATE FUNCTION fail_boom() RETURNS trigger AS $$
      BEGIN
        IF NEW.label = 'Boom' THEN RAISE EXCEPTION 'boom'; END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await db.execute(sql`
      CREATE TRIGGER fail_boom BEFORE INSERT ON event_time_block
      FOR EACH ROW EXECUTE FUNCTION fail_boom()`);
    try {
      const response = await apply(cycle.id, [
        sunday.template.id,
        doomed.template.id,
      ]);

      expect(response.statusCode).toBe(500);
      expect(await storedEvents(cycle.id)).toEqual([]);
    } finally {
      await db.execute(sql`DROP TRIGGER fail_boom ON event_time_block`);
      await db.execute(sql`DROP FUNCTION fail_boom()`);
    }
  });

  it('produces one generated set under concurrent Apply requests', async () => {
    const seed = await signIn();
    const sunday = await seedTemplate({ churchId: seed.churchAId });
    const cycle = await seedCycle({ churchId: seed.churchAId, ...FORTNIGHT });

    const responses = await Promise.all([
      apply(cycle.id, [sunday.template.id]),
      apply(cycle.id, [sunday.template.id]),
    ]);

    const totals = responses.map((response) => response.json());
    expect(totals).toContainEqual(TWO_SUNDAYS);
    expect(totals).toContainEqual(NOTHING);
    expect(await storedEvents(cycle.id)).toHaveLength(2);
    expect(await storedBlocks(cycle.id)).toHaveLength(2);
  });

  it('serializes with Send: a Draft applied first is sent whole, otherwise Apply is refused', async () => {
    const seed = await signIn();
    const saturday = await seedTemplate({
      churchId: seed.churchAId,
      name: 'Saturday',
      weekday: 6,
    });
    const sunday = await seedTemplate({ churchId: seed.churchAId });
    const cycle = await seedCycle({ churchId: seed.churchAId, ...FORTNIGHT });
    // Send refuses an empty Draft, so the Cycle already holds Events.
    expect((await apply(cycle.id, [saturday.template.id])).statusCode).toBe(
      201,
    );

    const [applied, sent] = await Promise.all([
      apply(cycle.id, [sunday.template.id]),
      app.inject({
        method: 'POST',
        url: `/api/v1/admin/cycles/${cycle.id}/send`,
      }),
    ]);

    const rows = await db
      .select()
      .from(event)
      .where(eq(event.cycleId, cycle.id));
    expect(sent.statusCode).toBe(204);
    expect(rows.every((row) => row.status === 'scheduled')).toBe(true);
    if (applied.statusCode === 201) {
      expect(rows).toHaveLength(4);
    } else {
      expect(applied.statusCode).toBe(409);
      expect(rows.map((row) => row.title)).toEqual(['Saturday', 'Saturday']);
    }
  });
});

describe('Apply templates access', () => {
  it('returns 401 when signed out', async () => {
    mockGetSession.mockResolvedValue(null as never);

    const response = await apply(randomUUID(), [randomUUID()]);

    expect(response.statusCode).toBe(401);
  });

  it.each([
    'member',
    'leader',
  ] as const)('returns 403 to a %s without the ChurchAdmin capability', async (persona) => {
    await signIn({ persona });

    const response = await apply(randomUUID(), [randomUUID()]);

    expect(response.statusCode).toBe(403);
  });

  it('scopes a foreign Church Cycle to 404 for an admin without a Volunteer profile', async () => {
    const seed = await signIn();
    const sunday = await seedTemplate({ churchId: seed.churchAId });
    const foreign = await seedCycle({ churchId: seed.churchBId, ...FORTNIGHT });
    const own = await seedCycle({
      churchId: seed.churchAId,
      startDate: '2026-12-07',
      endDate: '2026-12-20',
    });

    expect((await apply(foreign.id, [sunday.template.id])).statusCode).toBe(
      404,
    );
    expect((await apply(own.id, [sunday.template.id])).statusCode).toBe(201);
  });
});
