import { event, eventTimeBlock, ministryParticipation, role } from '@church/db';
import { parseInstant, resetClock, setTestClock } from '@church/time';
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
import { VolunteerScheduleController } from '@/api/controllers/volunteer-schedule-controller';
import { DbActiveChurchResolver } from '@/application/db-active-church-resolver';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleChurchMembershipRepository } from '@/infrastructure/auth/drizzle-church-membership-repository';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurchMembership } from '@/seeds/builders/church';
import { buildMinistry } from '@/seeds/builders/ministry';
import { buildAssignment } from '@/seeds/builders/scheduling';
import { buildMinistryMembership } from '@/seeds/builders/volunteer';
import {
  createSchedulingManagers,
  seedRequirement,
  seedRole,
  seedShift,
  seedVolunteerMembership,
} from '@/tests/application/scheduling-schedule.helpers';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  schedulingTestDb as db,
  resetSchedulingPhase3Db,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';
import { testSessionGateway } from '@/tests/test-support/session-gateway';
import { compareStatementCounts } from '@/tests/test-support/statement-count';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn(), setActiveOrganization: vi.fn() } },
}));
const { auth } = await import('@/main/di/server-auth');
const getSession = vi.mocked(auth.api.getSession);

const SCHEDULE = { method: 'GET', url: '/api/v1/volunteer/schedule' } as const;
const NOW = '2030-07-15T12:00:00.000Z';
const SHIFT_MS = 2 * 60 * 60 * 1000;
let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  const { volunteerManager } = createSchedulingManagers();
  const activeChurchResolver = new DbActiveChurchResolver({
    churchRepository: new DrizzleChurchRepository({ db }),
    unitOfWork: new DrizzleUnitOfWork({ db }),
    actorRepository: new DrizzleAuthorityActorResolver({ db }),
    membershipRepository: new DrizzleChurchMembershipRepository({ db }),
  });
  const controller = new VolunteerScheduleController({
    sessionGateway: testSessionGateway(),
    volunteerManager,
    activeChurchResolver,
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
  await resetSchedulingPhase3Db();
  setTestClock({ instant: parseInstant({ value: NOW }) });
});
afterEach(() => {
  resetClock();
});

interface SeedCycleInput {
  name: string;
  start: string;
  end: string;
}

interface SeedServingInput {
  title: string;
  start: string;
  ministryId: string;
  cycleId: string;
  assigned?: boolean;
  cancelled?: 'event' | 'block';
  hidden?: boolean;
  roleName?: string;
}

async function seedWorld() {
  const base = await seedSchedulingPhase3Base();
  const { churchAId: churchId, ministryAId: ministryId } = base;
  const me = await seedVolunteerMembership({
    churchId,
    ministryId,
    name: 'Maria Souza',
    email: 'maria@test.com',
    ministryAccessLevel: 'volunteer',
  });
  await buildChurchMembership({
    db,
    churchId,
    userId: me.volunteer.userId,
    accessLevel: 'member',
  });
  getSession.mockResolvedValue({
    user: { id: me.volunteer.userId },
    session: { activeOrganizationId: churchId },
  } as never);

  const joinMinistry = async (name: string) => {
    const joined = await buildMinistry({ db, churchId, name });
    await buildMinistryMembership({
      db,
      churchId,
      volunteerId: me.volunteer.id,
      ministryId: joined.id,
      ministryAccessLevel: 'volunteer',
      roleIds: [],
    });
    return joined.id;
  };
  const cycle = async ({ name, start, end }: SeedCycleInput) => {
    const seeded = await createSchedulingPhase3Cycle({
      churchId,
      name,
      startDate: new Date(start),
      endDate: new Date(end),
      state: 'sent',
    });
    return seeded.id;
  };
  const roles = new Map<string, string>();
  const roleIdOf = async (inMinistryId: string, name: string) => {
    const key = `${inMinistryId}:${name}`;
    const known = roles.get(key);
    if (known) return known;
    const seeded = await seedRole({
      churchId,
      ministryId: inMinistryId,
      name,
    });
    roles.set(key, seeded.id);
    return seeded.id;
  };

  /** One published Event, block and two-hour Shift, mine unless `assigned` is false. */
  const serve = async ({
    title,
    start,
    ministryId: inMinistryId,
    cycleId,
    assigned = true,
    cancelled,
    hidden,
    roleName = 'Teacher',
  }: SeedServingInput) => {
    const startTime = new Date(start);
    const endTime = new Date(startTime.getTime() + SHIFT_MS);
    const graph = await createSchedulingPhase3EventGraph({
      churchId,
      ministryId: inMinistryId,
      cycleId,
      title,
      start: startTime,
      end: endTime,
      status: 'scheduled',
    });
    const { participation, eventTimeBlock: block } = graph;
    await db
      .update(ministryParticipation)
      .set({ state: 'published' })
      .where(eq(ministryParticipation.id, participation.id));
    const shift = await seedShift({
      churchId,
      participationId: participation.id,
      eventTimeBlockId: block.id,
      startTime,
      endTime,
      label: title,
    });
    const roleId = await roleIdOf(inMinistryId, roleName);
    const requirement = await seedRequirement({
      churchId,
      participationId: participation.id,
      shiftId: shift.id,
      roleId,
      peopleNeeded: 2,
    });
    const assignment = assigned
      ? await buildAssignment({
          db,
          churchId,
          participationId: participation.id,
          shiftId: shift.id,
          volunteerId: me.volunteer.id,
          roleId,
          shiftRequirementId: requirement.id,
          status: 'pending',
        })
      : undefined;
    if (cancelled === 'event') {
      await db
        .update(event)
        .set({ status: 'cancelled' })
        .where(eq(event.id, graph.event.id));
    }
    if (cancelled === 'block') {
      await db
        .update(eventTimeBlock)
        .set({ status: 'cancelled' })
        .where(eq(eventTimeBlock.id, block.id));
    }
    if (hidden) {
      await db
        .update(event)
        .set({ isHidden: true })
        .where(eq(event.id, graph.event.id));
    }
    return {
      assignmentId: assignment?.id,
      eventId: graph.event.id,
      shiftId: shift.id,
      roleId,
    };
  };

  return { ministryId, joinMinistry, cycle, serve };
}

const YEAR = {
  name: 'Year',
  start: '2030-01-01T00:00:00Z',
  end: '2030-12-31T00:00:00Z',
};
const LAST_YEAR = {
  name: 'Last year',
  start: '2029-01-01T00:00:00Z',
  end: '2029-12-31T00:00:00Z',
};

async function readSchedule() {
  const response = await app.inject(SCHEDULE);
  expect(response.statusCode, response.body).toBe(200);
  return response.json();
}

describe('GET /volunteer/schedule reads (database-backed)', () => {
  it('answers the whole body across Ministries and Cycles', async () => {
    const { ministryId, joinMinistry, cycle, serve } = await seedWorld();
    const choirId = await joinMinistry('Choir');
    const yearId = await cycle(YEAR);
    const lastYearId = await cycle(LAST_YEAR);
    const inA = { ministryId, cycleId: yearId };
    const inChoir = { ministryId: choirId, cycleId: yearId };

    await serve({
      ...inA,
      cycleId: lastYearId,
      title: 'Long gone',
      start: '2029-06-03T12:00:00.000Z',
    });
    await serve({
      ...inA,
      title: 'Over today',
      start: '2030-07-15T09:00:00.000Z',
    });
    const running = await serve({
      ...inA,
      title: 'Running',
      start: '2030-07-15T11:00:00.000Z',
    });
    await serve({
      ...inA,
      title: 'Cancelled and started',
      start: '2030-07-15T11:30:00.000Z',
      cancelled: 'event',
    });
    await serve({
      ...inA,
      title: 'Hidden',
      start: '2030-07-18T12:00:00.000Z',
      hidden: true,
    });
    const gone = await serve({
      ...inChoir,
      title: 'Cancelled ahead',
      start: '2030-07-19T12:00:00.000Z',
      cancelled: 'block',
    });
    const next = await serve({
      ...inChoir,
      title: 'Next',
      start: '2030-08-02T12:00:00.000Z',
      roleName: 'Singer',
    });
    await serve({
      ...inChoir,
      title: 'Someone else',
      start: '2030-08-09T12:00:00.000Z',
      assigned: false,
    });
    // An archived Role still names the work already assigned to it.
    await db
      .update(role)
      .set({ archivedAt: new Date(NOW) })
      .where(eq(role.id, next.roleId));

    const item = (
      seeded: typeof running,
      title: string,
      start: string,
      roleName: string,
      owner: { id: string; name: string },
      cancelled = false,
    ) => ({
      assignmentId: seeded.assignmentId,
      eventId: seeded.eventId,
      eventTitle: title,
      shiftId: seeded.shiftId,
      startTime: start,
      endTime: new Date(Date.parse(start) + SHIFT_MS).toISOString(),
      ministryId: owner.id,
      ministryName: owner.name,
      sectorName: 'Geral',
      roleId: seeded.roleId,
      roleName,
      status: 'pending',
      cancelled,
      swapRequested: false,
    });
    const a = { id: ministryId, name: 'Scheduling Ministry A' };
    const choir = { id: choirId, name: 'Choir' };
    const first = item(
      running,
      'Running',
      '2030-07-15T11:00:00.000Z',
      'Teacher',
      a,
    );

    expect(await readSchedule()).toEqual({
      assignments: [
        first,
        item(
          gone,
          'Cancelled ahead',
          '2030-07-19T12:00:00.000Z',
          'Teacher',
          choir,
          true,
        ),
        item(next, 'Next', '2030-08-02T12:00:00.000Z', 'Singer', choir),
      ],
      // Hidden and cancelled Events still list their Schedule; a past Cycle does not.
      schedules: [
        {
          ministryId: choirId,
          ministryName: 'Choir',
          cycleId: yearId,
          cycleName: 'Year',
        },
        {
          ministryId,
          ministryName: 'Scheduling Ministry A',
          cycleId: yearId,
          cycleName: 'Year',
        },
      ],
      counts: { upcoming: 2, thisMonth: 1, openSwaps: 0 },
      next: first,
      options: { months: ['2030-07', '2030-08'], ministries: [choir, a] },
    });
  });

  it('costs the same statements for little and long history', async () => {
    const { ministryId, cycle, serve } = await seedWorld();
    const yearId = await cycle(YEAR);
    const mine = { ministryId, cycleId: yearId };
    await serve({ ...mine, title: 'Next', start: '2030-07-20T12:00:00.000Z' });

    const { small, large } = await compareStatementCounts({
      app,
      requests: [SCHEDULE],
      grow: async () => {
        const lastYearId = await cycle(LAST_YEAR);
        for (const month of [2, 4, 6, 8]) {
          await serve({
            ministryId,
            cycleId: lastYearId,
            title: `Past ${month}`,
            start: `2029-0${month}-03T12:00:00.000Z`,
            roleName: `Past role ${month}`,
          });
          await serve({
            ...mine,
            title: `Over ${month}`,
            start: `2030-0${month > 6 ? 6 : month}-0${month}T12:00:00.000Z`,
          });
        }
        for (const day of [21, 28]) {
          await serve({
            ...mine,
            title: `Ahead ${day}`,
            start: `2030-07-${day}T12:00:00.000Z`,
            roleName: `Role ${day}`,
          });
        }
      },
    });

    expect(large[0]?.response.json().assignments).toHaveLength(3);
    expect([small[0]?.statements, large[0]?.statements]).toEqual([16, 16]);
  });

  it('costs the same statements for one and several member Ministries', async () => {
    const { ministryId, joinMinistry, cycle, serve } = await seedWorld();
    const yearId = await cycle(YEAR);
    await serve({
      ministryId,
      cycleId: yearId,
      title: 'Next',
      start: '2030-07-20T12:00:00.000Z',
    });

    const { small, large } = await compareStatementCounts({
      app,
      requests: [SCHEDULE],
      grow: async () => {
        for (const day of [21, 22, 23]) {
          const joinedId = await joinMinistry(`Ministry ${day}`);
          const cycleId = await cycle({
            name: `Cycle ${day}`,
            start: `2031-0${day - 20}-01T00:00:00Z`,
            end: `2031-0${day - 20}-20T00:00:00Z`,
          });
          await serve({
            ministryId: joinedId,
            cycleId,
            title: `Event ${day}`,
            start: `2031-0${day - 20}-05T12:00:00.000Z`,
          });
        }
      },
    });

    expect(large[0]?.response.json().schedules).toHaveLength(4);
    expect([small[0]?.statements, large[0]?.statements]).toEqual([16, 16]);
  });
});
