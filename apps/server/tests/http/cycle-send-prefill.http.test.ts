import { appConfig } from '@church/app-config';
import {
  cycle,
  event,
  eventTimeBlock,
  ministry,
  ministryParticipation,
  outboxMessage,
  participationEventTimeBlockInclusion,
  sector,
  shift,
  shiftRequirement,
  templateTimeBlock,
  unavailableShift,
} from '@church/db';
import { m } from '@church/i18n/messages';
import { parseCalendarDay, parseInstant, parseTimeOfDay } from '@church/time';
import { and, asc, eq } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AuthorityGuard } from '@/api/auth/authority-guard';
import { ChurchAdminController } from '@/api/controllers/church-admin-controller';
import { UsualSetupController } from '@/api/controllers/usual-setup-controller';
import { ChurchNotifications } from '@/application/church-notifications';
import { ChurchRecipients } from '@/application/church-recipients';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbCycleManager } from '@/application/db-cycle-manager';
import { DbEventTemplateManager } from '@/application/db-event-template-manager';
import { DbMinistryManager } from '@/application/db-ministry-manager';
import { DbPlanningEventManager } from '@/application/db-planning-event-manager';
import { UsualSetupStaffingSeeder } from '@/application/usual-setup-staffing-seeder';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
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
  buildMinistry,
  buildRole,
  buildSector,
} from '@/seeds/builders/ministry';
import { buildEventTemplate, buildUsualSetup } from '@/seeds/builders/planning';
import {
  buildAssignment,
  buildCycle,
  buildEventTimeBlock,
  buildShift,
  buildShiftRequirement,
} from '@/seeds/builders/scheduling';
import {
  buildAvailabilityCheck,
  buildUnavailableShift,
} from '@/seeds/builders/unavailable-shift';
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

let app: FastifyTypedInstance;

function createManagers() {
  const db = schedulingTestDb;
  const cycleRepository = new DrizzleCycleRepository({ db });
  const eventRepository = new DrizzlePlanningEventRepository({ db });
  const churchRepository = new DrizzleChurchRepository({ db });
  const unitOfWork = new DrizzleUnitOfWork({ db });
  const participationRepository = new DrizzleMinistryParticipationRepository({
    db,
  });
  const shiftRepository = new DrizzleShiftRepository({ db });
  const usualSetupRepository = new DrizzleUsualSetupRepository({ db });
  const ministryRepository = new DrizzleMinistryRepository({ db });
  const templateRepository = new DrizzleEventTemplateRepository({ db });
  const staffingSeeder = new UsualSetupStaffingSeeder({
    participationRepository,
    shiftRepository,
    usualSetupRepository,
    ministryRepository,
  });
  return {
    ministryRepository,
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
  };
}

beforeAll(async () => {
  const db = schedulingTestDb;
  const managers = createManagers();
  app = await createFastify({ locale: testLocale });
  // Real managers, repositories and AuthorityService; only the session and
  // Active Church selection are seams.
  const authorityGuard = new AuthorityGuard({
    manager: new DbAuthorityManager({
      actorRepository: new DrizzleAuthorityActorResolver({ db }),
      scopeRepository: {} as never,
      eventRepository: {} as never,
      eventTimeBlockRepository: {} as never,
      ministryRepository: managers.ministryRepository,
    }),
  });
  const ministryManager = new DbMinistryManager({
    ministryRepo: managers.ministryRepository,
    volunteerRepo: new DrizzleVolunteerRepository({ db }),
    invitationRepo: {} as never,
    unitOfWork: new DrizzleUnitOfWork({ db }),
  });
  const admin = new ChurchAdminController({
    cycleManager: managers.cycleManager,
    eventTemplateManager: managers.eventTemplateManager,
    planningEventManager: managers.planningEventManager,
    activeChurchResolver: activeChurchResolver as never,
    ministryManager,
    authorityGuard,
  });
  const { createSchedulingManagers } = await import(
    '@/tests/application/scheduling-schedule.helpers'
  );
  const usualSetup = new UsualSetupController({
    ministryManager,
    participationManager: createSchedulingManagers().participationManager,
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard,
  });
  await app.register(
    async (instance) => {
      for (const controller of [admin, usualSetup]) {
        instance.register(controller.registerRoutes.bind(controller), {
          prefix: controller.prefix,
        });
      }
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
  await resetSchedulingPhase3Db();
});

const time = (value: string) => parseTimeOfDay({ value });

/**
 * Church A is America/Sao_Paulo (UTC-3, no DST). The Cycle holds Saturday
 * 2027-01-02 (Night 22–02, overnight) and Sunday 2027-01-03 (Welcome 09–10,
 * Service 10–12).
 */
async function seed() {
  const base = await seedSchedulingPhase3Base();
  const db = schedulingTestDb;
  const churchId = base.churchAId;
  mockGetSession.mockResolvedValue({
    user: { id: base.adminUserId },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId,
    volunteerId: base.adminVolunteerId,
    hasVolunteerMembership: true,
    autoSelected: false,
  });
  const worship = await buildMinistry({ db, churchId, name: 'Worship' });
  const allIn = await buildMinistry({
    db,
    churchId,
    name: 'All in',
    defaultDirection: 'all_in',
  });
  const optedOut = await buildMinistry({
    db,
    churchId,
    name: 'Opted out',
    defaultDirection: 'all_in',
  });
  const archived = await buildMinistry({ db, churchId, name: 'Archived' });
  await db
    .update(ministry)
    .set({ deletedAt: new Date() })
    .where(eq(ministry.id, archived.id));
  const stage = await buildSector({
    db,
    churchId,
    ministryId: worship.id,
    name: 'Stage',
  });
  const door = await buildSector({
    db,
    churchId,
    ministryId: worship.id,
    name: 'Door',
  });
  const singer = await buildRole({
    db,
    churchId,
    ministryId: worship.id,
    name: 'Singer',
  });
  const sunday = await buildEventTemplate({
    db,
    churchId,
    name: 'Sunday',
    weekday: 0,
    blocks: [
      { label: 'Welcome', startTime: time('09:00'), endTime: time('10:00') },
      { label: 'Service', startTime: time('10:00'), endTime: time('12:00') },
    ],
  });
  const saturday = await buildEventTemplate({
    db,
    churchId,
    name: 'Saturday',
    weekday: 6,
    blocks: [
      { label: 'Night', startTime: time('22:00'), endTime: time('02:00') },
    ],
  });
  const [welcome, service] = sunday.blocks;
  const [night] = saturday.blocks;
  if (!welcome || !service || !night) throw new Error('template blocks');
  for (const block of [welcome, service, night]) {
    await buildUsualSetup({
      db,
      churchId,
      ministryId: optedOut.id,
      sourceTemplateTimeBlockId: block.id,
      id: crypto.randomUUID(),
      serves: false,
      shiftSplit: { kind: 'equal', count: 1 },
      headcounts: [],
    });
    await buildUsualSetup({
      db,
      churchId,
      ministryId: archived.id,
      sourceTemplateTimeBlockId: block.id,
      id: crypto.randomUUID(),
      serves: true,
      shiftSplit: { kind: 'equal', count: 1 },
      headcounts: [],
    });
  }
  const cycleRow = await buildCycle({
    db,
    churchId,
    name: 'January',
    startDate: parseCalendarDay({ value: '2027-01-02' }),
    endDate: parseCalendarDay({ value: '2027-01-08' }),
    state: 'draft',
  });
  return {
    base,
    churchId,
    cycleId: cycleRow.id,
    templateIds: [sunday.template.id, saturday.template.id],
    worship,
    allIn,
    optedOut,
    archived,
    stage,
    door,
    singer,
    welcome,
    service,
    night,
  };
}

type Seed = Awaited<ReturnType<typeof seed>>;

function post(url: string, payload?: object, locale?: string) {
  return app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    payload,
    cookies: locale ? { [appConfig.localeCookieName]: locale } : {},
  });
}

function applyTemplates(fixture: Seed) {
  return post(`/admin/cycles/${fixture.cycleId}/apply-templates`, {
    templateIds: fixture.templateIds,
  });
}

function send(fixture: Seed, locale?: string) {
  return post(`/admin/cycles/${fixture.cycleId}/send`, undefined, locale);
}

async function summary(fixture: Seed) {
  const response = await app.inject({
    method: 'GET',
    url: `/api/v1/admin/cycles/${fixture.cycleId}/send-summary`,
  });
  expect(response.statusCode).toBe(200);
  return response.json();
}

async function queuedCount() {
  return (await schedulingTestDb.select().from(outboxMessage)).length;
}

function saveSetup(ministryId: string, blockId: string, entry: object) {
  return app.inject({
    method: 'PUT',
    url: `/api/v1/ministries/${ministryId}/usual-setup/${blockId}`,
    payload: entry,
  });
}

/** Every staffing row of the Cycle, ordered and keyed by readable names. */
async function staffing(cycleId: string) {
  const db = schedulingTestDb;
  const inclusions = await db
    .select({
      ministry: ministry.name,
      block: eventTimeBlock.label,
    })
    .from(participationEventTimeBlockInclusion)
    .innerJoin(
      ministryParticipation,
      eq(
        ministryParticipation.id,
        participationEventTimeBlockInclusion.participationId,
      ),
    )
    .innerJoin(ministry, eq(ministry.id, ministryParticipation.ministryId))
    .innerJoin(
      eventTimeBlock,
      eq(
        eventTimeBlock.id,
        participationEventTimeBlockInclusion.eventTimeBlockId,
      ),
    )
    .innerJoin(event, eq(event.id, eventTimeBlock.eventId))
    .where(eq(event.cycleId, cycleId))
    .orderBy(asc(ministry.name), asc(eventTimeBlock.startTime));
  const shifts = await db
    .select({
      id: shift.id,
      ministry: ministry.name,
      block: eventTimeBlock.label,
      start: shift.startTime,
      end: shift.endTime,
    })
    .from(shift)
    .innerJoin(
      ministryParticipation,
      eq(ministryParticipation.id, shift.participationId),
    )
    .innerJoin(ministry, eq(ministry.id, ministryParticipation.ministryId))
    .innerJoin(eventTimeBlock, eq(eventTimeBlock.id, shift.eventTimeBlockId))
    .innerJoin(event, eq(event.id, eventTimeBlock.eventId))
    .where(eq(event.cycleId, cycleId))
    .orderBy(asc(ministry.name), asc(shift.startTime));
  const requirements = await db
    .select({
      shiftId: shiftRequirement.shiftId,
      sector: sector.name,
      peopleNeeded: shiftRequirement.peopleNeeded,
    })
    .from(shiftRequirement)
    .innerJoin(sector, eq(sector.id, shiftRequirement.sectorId))
    .orderBy(asc(sector.name));
  return {
    inclusions,
    shifts: shifts.map(({ id, ...row }) => ({
      ...row,
      start: row.start.toISOString(),
      end: row.end.toISOString(),
      requirements: requirements
        .filter((requirement) => requirement.shiftId === id)
        .map(({ sector: name, peopleNeeded }) => `${name}:${peopleNeeded}`),
    })),
  };
}

async function cycleState(cycleId: string) {
  const [row] = await schedulingTestDb
    .select({ state: cycle.state })
    .from(cycle)
    .where(eq(cycle.id, cycleId));
  const events = await schedulingTestDb
    .select({ status: event.status })
    .from(event)
    .where(eq(event.cycleId, cycleId));
  return {
    state: row?.state,
    events: [...new Set(events.map(({ status }) => status))],
  };
}

/** The applied Sunday Event and its Welcome and Service copies. */
async function appliedSunday(fixture: Seed) {
  const db = schedulingTestDb;
  const [sunday] = await db
    .select({ id: event.id })
    .from(event)
    .where(and(eq(event.cycleId, fixture.cycleId), eq(event.title, 'Sunday')));
  if (!sunday) throw new Error('Sunday event');
  const blocks = await db
    .select({ id: eventTimeBlock.id, label: eventTimeBlock.label })
    .from(eventTimeBlock)
    .where(eq(eventTimeBlock.eventId, sunday.id));
  const byLabel = new Map(blocks.map(({ id, label }) => [label, id]));
  return {
    eventId: sunday.id,
    welcomeId: byLabel.get('Welcome'),
    serviceId: byLabel.get('Service'),
  };
}

interface EditSundayInput {
  fixture: Seed;
  sunday: Awaited<ReturnType<typeof appliedSunday>>;
}

/**
 * The complete Sunday edit: Welcome retimed to 08:30–09:30 and relabelled
 * Arrival, Service kept, and a manual Lunch row added.
 */
function editSunday({ fixture, sunday }: EditSundayInput) {
  return app.inject({
    method: 'PATCH',
    url: `/api/v1/admin/cycles/${fixture.cycleId}/events/${sunday.eventId}`,
    payload: {
      title: 'Edited Sunday',
      start: '2027-01-03T11:30:00.000Z',
      end: '2027-01-03T16:00:00.000Z',
      eventTimeBlocks: [
        {
          id: sunday.welcomeId,
          label: 'Arrival',
          startTime: '2027-01-03T11:30:00.000Z',
          endTime: '2027-01-03T12:30:00.000Z',
        },
        {
          id: sunday.serviceId,
          label: 'Service',
          startTime: '2027-01-03T13:00:00.000Z',
          endTime: '2027-01-03T15:00:00.000Z',
        },
        {
          label: 'Lunch',
          startTime: '2027-01-03T15:00:00.000Z',
          endTime: '2027-01-03T16:00:00.000Z',
        },
      ],
    },
  });
}

const SERVING_WELCOME = (fixture: Seed) => ({
  serves: true,
  shiftSplit: {
    kind: 'manual',
    spans: [
      { label: 'Early', startTime: '09:00', endTime: '09:30' },
      { label: 'Late', startTime: '09:30', endTime: '10:00' },
    ],
  },
  headcounts: [
    {
      shiftIndex: 0,
      sectorId: fixture.stage.id,
      roleId: fixture.singer.id,
      peopleNeeded: 2,
    },
    {
      shiftIndex: 1,
      sectorId: fixture.stage.id,
      roleId: fixture.singer.id,
      peopleNeeded: 1,
    },
    {
      shiftIndex: 1,
      sectorId: fixture.door.id,
      roleId: fixture.singer.id,
      peopleNeeded: 3,
    },
  ],
});

describe('POST /admin/cycles/:cycleId/send pre-fills staffing from the latest Usual setup', () => {
  it('applies calendar copies only, then seeds setup saved after Apply with exact indexed counts and precedence', async () => {
    const fixture = await seed();
    expect((await applyTemplates(fixture)).statusCode).toBe(201);
    expect(await staffing(fixture.cycleId)).toEqual({
      inclusions: [],
      shifts: [],
    });

    // Saved after Apply, before Send.
    expect(
      (
        await saveSetup(
          fixture.worship.id,
          fixture.welcome.id,
          SERVING_WELCOME(fixture),
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await saveSetup(fixture.worship.id, fixture.night.id, {
          serves: true,
          shiftSplit: { kind: 'equal', count: 2 },
          headcounts: [
            {
              shiftIndex: 1,
              sectorId: fixture.door.id,
              roleId: fixture.singer.id,
              peopleNeeded: 1,
            },
          ],
        })
      ).statusCode,
    ).toBe(200);
    // The confirmation counts what this same policy will pre-fill: All in and
    // Worship, each once however many blocks they get.
    expect(await summary(fixture)).toEqual({
      eventCount: 2,
      prefilledMinistryCount: 2,
    });

    expect((await send(fixture)).statusCode).toBe(204);

    expect(await staffing(fixture.cycleId)).toEqual({
      // all_in without an entry: every block; Worship: its serving blocks;
      // Opted out (explicit serves=false), Archived and all_out: nothing.
      inclusions: [
        { ministry: 'All in', block: 'Night' },
        { ministry: 'All in', block: 'Welcome' },
        { ministry: 'All in', block: 'Service' },
        { ministry: 'Worship', block: 'Night' },
        { ministry: 'Worship', block: 'Welcome' },
      ],
      shifts: [
        {
          ministry: 'All in',
          block: 'Night',
          start: '2027-01-03T01:00:00.000Z',
          end: '2027-01-03T05:00:00.000Z',
          requirements: [],
        },
        {
          ministry: 'All in',
          block: 'Welcome',
          start: '2027-01-03T12:00:00.000Z',
          end: '2027-01-03T13:00:00.000Z',
          requirements: [],
        },
        {
          ministry: 'All in',
          block: 'Service',
          start: '2027-01-03T13:00:00.000Z',
          end: '2027-01-03T15:00:00.000Z',
          requirements: [],
        },
        // Overnight: 22:00–00:00 then 00:00–02:00 on the next day.
        {
          ministry: 'Worship',
          block: 'Night',
          start: '2027-01-03T01:00:00.000Z',
          end: '2027-01-03T03:00:00.000Z',
          requirements: [],
        },
        {
          ministry: 'Worship',
          block: 'Night',
          start: '2027-01-03T03:00:00.000Z',
          end: '2027-01-03T05:00:00.000Z',
          requirements: ['Door:1'],
        },
        {
          ministry: 'Worship',
          block: 'Welcome',
          start: '2027-01-03T12:00:00.000Z',
          end: '2027-01-03T12:30:00.000Z',
          requirements: ['Stage:2'],
        },
        {
          ministry: 'Worship',
          block: 'Welcome',
          start: '2027-01-03T12:30:00.000Z',
          end: '2027-01-03T13:00:00.000Z',
          requirements: ['Door:3', 'Stage:1'],
        },
      ],
    });
    expect(await cycleState(fixture.cycleId)).toEqual({
      state: 'sent',
      events: ['scheduled'],
    });
  });

  it('leaves one-off and deleted-source blocks unseeded and falls back to one whole-block Shift on template drift without retiming the copy', async () => {
    const fixture = await seed();
    const db = schedulingTestDb;
    expect((await applyTemplates(fixture)).statusCode).toBe(201);
    const [sunday] = await db
      .select({ id: event.id })
      .from(event)
      .where(
        and(eq(event.cycleId, fixture.cycleId), eq(event.title, 'Sunday')),
      );
    if (!sunday) throw new Error('Sunday event');
    // A later one-off block on the same day, inside the widened Event.
    await db
      .update(event)
      .set({ end: new Date('2027-01-03T19:00:00Z') })
      .where(eq(event.id, sunday.id));
    await buildEventTimeBlock({
      db,
      churchId: fixture.churchId,
      eventId: sunday.id,
      start: parseInstant({ value: '2027-01-03T18:00:00Z' }),
      end: parseInstant({ value: '2027-01-03T19:00:00Z' }),
      label: 'One-off',
    });
    // Template deletion nulls the copy's source link.
    await db
      .delete(templateTimeBlock)
      .where(eq(templateTimeBlock.id, fixture.service.id));
    // Retimed after Apply; the setup is valid for the new template bounds
    // but cannot fit the 09–10 copy.
    await db
      .update(templateTimeBlock)
      .set({ endTime: time('11:00') })
      .where(eq(templateTimeBlock.id, fixture.welcome.id));
    expect(
      (
        await saveSetup(fixture.worship.id, fixture.welcome.id, {
          ...SERVING_WELCOME(fixture),
          shiftSplit: {
            kind: 'manual',
            spans: [
              { startTime: '09:00', endTime: '10:00' },
              { startTime: '10:00', endTime: '11:00' },
            ],
          },
        })
      ).statusCode,
    ).toBe(200);

    expect((await send(fixture)).statusCode).toBe(204);

    const { shifts } = await staffing(fixture.cycleId);
    expect(shifts.filter((row) => row.block !== 'Night')).toEqual([
      {
        ministry: 'All in',
        block: 'Welcome',
        start: '2027-01-03T12:00:00.000Z',
        end: '2027-01-03T13:00:00.000Z',
        requirements: [],
      },
      // Counts summed per Sector × Role into the one fallback Shift.
      {
        ministry: 'Worship',
        block: 'Welcome',
        start: '2027-01-03T12:00:00.000Z',
        end: '2027-01-03T13:00:00.000Z',
        requirements: ['Door:3', 'Stage:3'],
      },
    ]);
    const copies = await db
      .select({
        label: eventTimeBlock.label,
        start: eventTimeBlock.startTime,
        end: eventTimeBlock.endTime,
      })
      .from(eventTimeBlock)
      .where(eq(eventTimeBlock.eventId, sunday.id))
      .orderBy(asc(eventTimeBlock.startTime));
    expect(
      copies.map(({ label, start, end }) => [
        label,
        start.toISOString(),
        end.toISOString(),
      ]),
    ).toEqual([
      ['Welcome', '2027-01-03T12:00:00.000Z', '2027-01-03T13:00:00.000Z'],
      ['Service', '2027-01-03T13:00:00.000Z', '2027-01-03T15:00:00.000Z'],
      ['One-off', '2027-01-03T18:00:00.000Z', '2027-01-03T19:00:00.000Z'],
    ]);
  });

  it('keeps Sent staffing, Assignments and availability unchanged after later setup saves and refuses a repeat Send', async () => {
    const fixture = await seed();
    const db = schedulingTestDb;
    await saveSetup(
      fixture.worship.id,
      fixture.welcome.id,
      SERVING_WELCOME(fixture),
    );
    await applyTemplates(fixture);
    expect((await send(fixture)).statusCode).toBe(204);
    const sent = await staffing(fixture.cycleId);

    const [requirement] = await db
      .select()
      .from(shiftRequirement)
      .innerJoin(sector, eq(sector.id, shiftRequirement.sectorId))
      .where(eq(sector.name, 'Stage'))
      .limit(1);
    if (!requirement) throw new Error('seeded requirement');
    const check = await buildAvailabilityCheck({
      db,
      churchId: fixture.churchId,
      cycleId: fixture.cycleId,
      ministryMembershipId: '44444444-4444-4444-8444-4444444444a1',
    });
    await buildUnavailableShift({
      db,
      churchId: fixture.churchId,
      availabilityCheckId: check.id,
      shiftId: requirement.shift_requirement.shiftId,
    });
    await buildAssignment({
      db,
      churchId: fixture.churchId,
      participationId: requirement.shift_requirement.participationId,
      shiftId: requirement.shift_requirement.shiftId,
      shiftRequirementId: requirement.shift_requirement.id,
      roleId: requirement.shift_requirement.roleId,
      volunteerId: fixture.base.adminVolunteerId,
      status: 'draft',
    });

    expect(
      (
        await saveSetup(fixture.worship.id, fixture.welcome.id, {
          serves: true,
          shiftSplit: { kind: 'equal', count: 1 },
          headcounts: [
            {
              shiftIndex: 0,
              sectorId: fixture.door.id,
              roleId: fixture.singer.id,
              peopleNeeded: 9,
            },
          ],
        })
      ).statusCode,
    ).toBe(200);
    const repeat = await send(fixture, 'en');
    expect(repeat.statusCode).toBe(409);
    expect(repeat.json()).toMatchObject({ error: 'ILLEGAL_STATE_TRANSITION' });

    expect(await staffing(fixture.cycleId)).toEqual(sent);
    expect(await db.select().from(unavailableShift)).toHaveLength(1);
    expect(
      (await db.select().from(shiftRequirement)).find(
        ({ id }) => id === requirement.shift_requirement.id,
      ),
    ).toEqual(requirement.shift_requirement);
  });

  it('serializes simultaneous Sends so staffing is created once', async () => {
    const fixture = await seed();
    await applyTemplates(fixture);

    const results = await Promise.all([send(fixture), send(fixture)]);

    expect(results.map(({ statusCode }) => statusCode).sort()).toEqual([
      204, 409,
    ]);
    const { inclusions, shifts } = await staffing(fixture.cycleId);
    expect(inclusions).toHaveLength(3);
    expect(shifts).toHaveLength(3);
    // The seeded admin leads the only led Ministry: one N2, not two.
    expect(await queuedCount()).toBe(1);
  });

  it('seeds a generated block retimed and relabelled through the Event edit from its source, and leaves a manual row unseeded', async () => {
    const fixture = await seed();
    expect((await applyTemplates(fixture)).statusCode).toBe(201);
    const sunday = await appliedSunday(fixture);
    expect((await editSunday({ fixture, sunday })).statusCode).toBe(200);

    expect((await send(fixture)).statusCode).toBe(204);

    const { shifts } = await staffing(fixture.cycleId);
    expect(
      shifts.filter(
        (row) => row.ministry === 'All in' && row.block !== 'Night',
      ),
    ).toEqual([
      {
        ministry: 'All in',
        block: 'Arrival',
        start: '2027-01-03T11:30:00.000Z',
        end: '2027-01-03T12:30:00.000Z',
        requirements: [],
      },
      {
        ministry: 'All in',
        block: 'Service',
        start: '2027-01-03T13:00:00.000Z',
        end: '2027-01-03T15:00:00.000Z',
        requirements: [],
      },
    ]);
    expect(shifts.filter((row) => row.block === 'Lunch')).toEqual([]);
  });

  it('serializes a concurrent Event edit and Send into one valid order that never edits the Sent calendar', async () => {
    const fixture = await seed();
    await applyTemplates(fixture);
    const sunday = await appliedSunday(fixture);

    const [edit, sent] = await Promise.all([
      editSunday({ fixture, sunday }),
      send(fixture),
    ]);

    expect(sent.statusCode).toBe(204);
    const [stored] = await schedulingTestDb
      .select({ title: event.title, status: event.status })
      .from(event)
      .where(eq(event.id, sunday.eventId));
    const blocks = await schedulingTestDb
      .select({ label: eventTimeBlock.label })
      .from(eventTimeBlock)
      .where(eq(eventTimeBlock.eventId, sunday.eventId))
      .orderBy(asc(eventTimeBlock.startTime));
    if (edit.statusCode === 200) {
      // Edit first: Send scheduled the edited graph.
      expect(stored).toEqual({ title: 'Edited Sunday', status: 'scheduled' });
      expect(blocks.map(({ label }) => label)).toEqual([
        'Arrival',
        'Service',
        'Lunch',
      ]);
    } else {
      // Send first: the stale edit is refused and the Sent calendar stays.
      expect(edit.statusCode).toBe(409);
      expect(edit.json().error).toBe('ILLEGAL_STATE_TRANSITION');
      expect(stored).toEqual({ title: 'Sunday', status: 'scheduled' });
      expect(blocks.map(({ label }) => label)).toEqual(['Welcome', 'Service']);
    }
  });

  it('rolls back every staffing row and the Cycle and Event states when a staffing write fails', async () => {
    const fixture = await seed();
    await saveSetup(
      fixture.worship.id,
      fixture.welcome.id,
      SERVING_WELCOME(fixture),
    );
    await applyTemplates(fixture);
    // A Sector hard-deleted under the saved setup makes the requirement
    // insert fail after other Ministries' rows were written.
    await schedulingTestDb.delete(sector).where(eq(sector.id, fixture.door.id));

    expect((await send(fixture)).statusCode).toBe(500);

    expect(await staffing(fixture.cycleId)).toEqual({
      inclusions: [],
      shifts: [],
    });
    expect(await cycleState(fixture.cycleId)).toEqual({
      state: 'draft',
      events: ['draft'],
    });
    expect(await queuedCount()).toBe(0);
  });

  it('refuses a Draft that already holds staffing with 409 DRAFT_STAFFING_RECONCILIATION_REQUIRED and writes nothing', async () => {
    const fixture = await seed();
    const db = schedulingTestDb;
    await saveSetup(
      fixture.worship.id,
      fixture.welcome.id,
      SERVING_WELCOME(fixture),
    );
    await applyTemplates(fixture);
    // Staffing written during Draft preparation, origin unknown.
    const [welcomeCopy] = await db
      .select({
        id: eventTimeBlock.id,
        eventId: eventTimeBlock.eventId,
        start: eventTimeBlock.startTime,
        end: eventTimeBlock.endTime,
      })
      .from(eventTimeBlock)
      .where(eq(eventTimeBlock.label, 'Welcome'));
    if (!welcomeCopy) throw new Error('Welcome copy');
    const [participation] = await db
      .select({ id: ministryParticipation.id })
      .from(ministryParticipation)
      .where(
        and(
          eq(ministryParticipation.eventId, welcomeCopy.eventId),
          eq(ministryParticipation.ministryId, fixture.worship.id),
        ),
      );
    if (!participation) throw new Error('Worship participation');
    await db.insert(participationEventTimeBlockInclusion).values({
      churchId: fixture.churchId,
      participationId: participation.id,
      eventTimeBlockId: welcomeCopy.id,
    });
    const preparedShift = await buildShift({
      db,
      churchId: fixture.churchId,
      participationId: participation.id,
      eventTimeBlockId: welcomeCopy.id,
      start: parseInstant({ value: welcomeCopy.start.toISOString() }),
      end: parseInstant({ value: welcomeCopy.end.toISOString() }),
    });
    const preparedRequirement = await buildShiftRequirement({
      db,
      churchId: fixture.churchId,
      participationId: participation.id,
      shiftId: preparedShift.id,
      sectorId: fixture.stage.id,
      roleId: fixture.singer.id,
      peopleNeeded: 4,
    });
    await buildAssignment({
      db,
      churchId: fixture.churchId,
      participationId: participation.id,
      shiftId: preparedShift.id,
      shiftRequirementId: preparedRequirement.id,
      roleId: fixture.singer.id,
      volunteerId: fixture.base.adminVolunteerId,
      status: 'draft',
    });
    const before = await staffing(fixture.cycleId);

    const english = await send(fixture, 'en');
    const portuguese = await send(fixture);

    expect(english.statusCode).toBe(409);
    expect(english.json()).toEqual({
      error: 'DRAFT_STAFFING_RECONCILIATION_REQUIRED',
      message: m.error_draft_staffing_reconciliation_required(
        {},
        { locale: 'en' },
      ),
    });
    expect(portuguese.json()).toEqual({
      error: 'DRAFT_STAFFING_RECONCILIATION_REQUIRED',
      message: m.error_draft_staffing_reconciliation_required(
        {},
        { locale: 'pt-BR' },
      ),
    });
    expect(await staffing(fixture.cycleId)).toEqual(before);
    expect(before.shifts).toEqual([
      expect.objectContaining({
        ministry: 'Worship',
        requirements: ['Stage:4'],
      }),
    ]);
    expect(await cycleState(fixture.cycleId)).toEqual({
      state: 'draft',
      events: ['draft'],
    });
    expect(await queuedCount()).toBe(0);
  });
});
