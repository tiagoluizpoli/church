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
import { VolunteerController } from '@/api/controllers/volunteer-controller';
import { DbActiveChurchResolver } from '@/application/db-active-church-resolver';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleChurchMembershipRepository } from '@/infrastructure/auth/drizzle-church-membership-repository';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurchMembership } from '@/seeds/builders/church';
import { buildAssignment } from '@/seeds/builders/scheduling';
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
import { compareStatementCounts } from '@/tests/test-support/statement-count';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn(), setActiveOrganization: vi.fn() } },
}));
const { auth } = await import('@/main/di/server-auth');
const getSession = vi.mocked(auth.api.getSession);

const DASHBOARD = {
  method: 'GET',
  url: '/api/v1/volunteer/dashboard',
} as const;
// Mid-July; Church A is America/Sao_Paulo (UTC-3), so the window opens in February.
const NOW = '2030-07-15T12:00:00.000Z';
const SHIFT_MS = 2 * 60 * 60 * 1000;
let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  const controller = new VolunteerController({
    volunteerManager: createSchedulingManagers().volunteerManager,
    activeChurchResolver: new DbActiveChurchResolver({
      churchRepository: new DrizzleChurchRepository({ db }),
      unitOfWork: new DrizzleUnitOfWork({ db }),
      actorRepository: new DrizzleAuthorityActorResolver({ db }),
      membershipRepository: new DrizzleChurchMembershipRepository({ db }),
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
  await resetSchedulingPhase3Db();
  setTestClock({ instant: parseInstant({ value: NOW }) });
});
afterEach(() => {
  resetClock();
});

interface SeedServingInput {
  title: string;
  start: string;
  cancelled?: 'event' | 'block';
  published?: boolean;
  status?: 'pending' | 'draft' | 'cancelled';
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
  const cycle = await createSchedulingPhase3Cycle({
    churchId,
    name: 'Year',
    startDate: new Date('2029-01-01T00:00:00Z'),
    endDate: new Date('2030-12-31T00:00:00Z'),
    state: 'sent',
  });
  const roles = new Map<string, string>();
  const roleId = async (name: string) => {
    const known = roles.get(name);
    if (known) return known;
    const seeded = await seedRole({ churchId, ministryId, name });
    roles.set(name, seeded.id);
    return seeded.id;
  };

  /** One Event, block, Shift and Assignment of mine, two hours long. */
  const serve = async ({
    title,
    start,
    cancelled,
    published = true,
    status = 'pending',
    roleName = 'Teacher',
  }: SeedServingInput) => {
    const startTime = new Date(start);
    const endTime = new Date(startTime.getTime() + SHIFT_MS);
    const graph = await createSchedulingPhase3EventGraph({
      churchId,
      ministryId,
      cycleId: cycle.id,
      title,
      start: startTime,
      end: endTime,
      status: 'scheduled',
    });
    const { participation, eventTimeBlock: block } = graph;
    if (published) {
      await db
        .update(ministryParticipation)
        .set({ state: 'published' })
        .where(eq(ministryParticipation.id, participation.id));
    }
    const shift = await seedShift({
      churchId,
      participationId: participation.id,
      eventTimeBlockId: block.id,
      startTime,
      endTime,
      label: title,
    });
    const servedRoleId = await roleId(roleName);
    const requirement = await seedRequirement({
      churchId,
      participationId: participation.id,
      shiftId: shift.id,
      roleId: servedRoleId,
      peopleNeeded: 2,
    });
    const assignment = await buildAssignment({
      db,
      churchId,
      participationId: participation.id,
      shiftId: shift.id,
      volunteerId: me.volunteer.id,
      roleId: servedRoleId,
      shiftRequirementId: requirement.id,
      status,
    });
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
    return { assignment, roleId: servedRoleId };
  };

  return { serve };
}

async function readDashboard() {
  const response = await app.inject(DASHBOARD);
  expect(response.statusCode, response.body).toBe(200);
  return response.json() as {
    nextAssignment: { assignmentId: string } | null;
    servingHistory: { month: string; served: number }[];
    upcomingAssignmentGroups: {
      eventTitle: string;
      assignments: { assignmentId: string; roleName: string }[];
    }[];
  };
}

describe('GET /volunteer/dashboard reads (database-backed)', () => {
  it('lists live published work and counts six Church months of serving', async () => {
    const { serve } = await seedWorld();
    // 31 January 23:00 in São Paulo is before the window, 1 February 00:00 opens it.
    await serve({ title: 'Before', start: '2030-02-01T02:00:00.000Z' });
    await serve({ title: 'Opening', start: '2030-02-01T03:00:00.000Z' });
    await serve({ title: 'June', start: '2030-06-02T12:00:00.000Z' });
    await serve({
      title: 'Gone Event',
      start: '2030-06-09T12:00:00.000Z',
      cancelled: 'event',
    });
    await serve({
      title: 'Gone Block',
      start: '2030-06-16T12:00:00.000Z',
      cancelled: 'block',
    });
    await serve({
      title: 'Not told',
      start: '2030-06-23T12:00:00.000Z',
      published: false,
    });
    await serve({
      title: 'Draft',
      start: '2030-06-30T12:00:00.000Z',
      status: 'draft',
    });
    const running = await serve({
      title: 'Running',
      start: '2030-07-15T11:00:00.000Z',
    });
    const next = await serve({
      title: 'Next',
      start: '2030-07-20T12:00:00.000Z',
      roleName: 'Singer',
    });
    await serve({
      title: 'Cancelled ahead',
      start: '2030-07-18T12:00:00.000Z',
      cancelled: 'block',
    });
    await serve({
      title: 'Cancelled Assignment',
      start: '2030-07-19T12:00:00.000Z',
      status: 'cancelled',
    });
    // An archived Role still names the work already assigned to it.
    await db
      .update(role)
      .set({ archivedAt: new Date(NOW) })
      .where(eq(role.id, next.roleId));

    const dashboard = await readDashboard();

    expect(dashboard.servingHistory).toEqual([
      { month: '2030-02-01', served: 1 },
      { month: '2030-03-01', served: 0 },
      { month: '2030-04-01', served: 0 },
      { month: '2030-05-01', served: 0 },
      { month: '2030-06-01', served: 1 },
      { month: '2030-07-01', served: 1 },
    ]);
    expect(
      dashboard.upcomingAssignmentGroups.map(({ eventTitle, assignments }) => [
        eventTitle,
        assignments.map(({ assignmentId, roleName }) => [
          assignmentId,
          roleName,
        ]),
      ]),
    ).toEqual([
      ['Running', [[running.assignment.id, 'Teacher']]],
      ['Next', [[next.assignment.id, 'Singer']]],
    ]);
    expect(dashboard.nextAssignment?.assignmentId).toBe(running.assignment.id);
  });

  it('grows its statements with the Volunteer history', async () => {
    const { serve } = await seedWorld();
    await serve({ title: 'June', start: '2030-06-02T12:00:00.000Z' });
    await serve({ title: 'Next', start: '2030-07-20T12:00:00.000Z' });

    const { small, large } = await compareStatementCounts({
      app,
      requests: [DASHBOARD],
      grow: async () => {
        const starts = [
          '2029-03-04T12:00:00.000Z',
          '2029-09-02T12:00:00.000Z',
          '2030-03-03T12:00:00.000Z',
          '2030-04-07T12:00:00.000Z',
          '2030-05-05T12:00:00.000Z',
          '2030-07-21T12:00:00.000Z',
          '2030-07-28T12:00:00.000Z',
        ];
        for (const [index, start] of starts.entries()) {
          await serve({
            title: `More ${index}`,
            start,
            roleName: `Role ${index}`,
          });
        }
        await serve({
          title: 'Cancelled',
          start: '2030-08-04T12:00:00.000Z',
          cancelled: 'event',
        });
      },
    });

    expect(small[0]?.response.statusCode).toBe(200);
    expect(large[0]?.response.statusCode).toBe(200);
    expect([small[0]?.statements, large[0]?.statements]).toEqual([24, 64]);
  });
});
