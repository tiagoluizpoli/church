import { randomUUID } from 'node:crypto';
import { appConfig } from '@church/app-config';
import pg from 'pg';
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
import { AssignController } from '@/api/controllers/assign-controller';
import { DbActiveChurchResolver } from '@/application/db-active-church-resolver';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DrizzleAuthorityActorResolver } from '@/infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleChurchMembershipRepository } from '@/infrastructure/auth/drizzle-church-membership-repository';
import { DrizzleSchedulingScopeResolver } from '@/infrastructure/auth/drizzle-scheduling-scope-resolver';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import { buildMinistry, buildTeam } from '@/seeds/builders/ministry';
import { buildAssignment } from '@/seeds/builders/scheduling';
import {
  buildTeamMembership,
  buildVolunteerWithMembership,
} from '@/seeds/builders/volunteer';
import {
  createSchedulingManagers,
  seedRequirement,
  seedRole,
  seedShift,
} from '@/tests/application/scheduling-schedule.helpers';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  schedulingTestDb as db,
  resetSchedulingPhase3Db,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn(), setActiveOrganization: vi.fn() } },
}));
const { auth } = await import('@/main/di/server-auth');
const getSession = vi.mocked(auth.api.getSession);
let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({ locale: testLocale });
  const actorRepository = new DrizzleAuthorityActorResolver({ db });
  const unitOfWork = new DrizzleUnitOfWork({ db });
  const ministryRepository = new DrizzleMinistryRepository({ db });
  const managers = createSchedulingManagers();
  const controller = new AssignController({
    participationManager: managers.participationManager,
    assignmentManager: managers.assignmentManager,
    activeChurchResolver: new DbActiveChurchResolver({
      actorRepository,
      membershipRepository: new DrizzleChurchMembershipRepository({ db }),
      churchRepository: new DrizzleChurchRepository({ db }),
      unitOfWork,
    }),
    authorityGuard: new AuthorityGuard({
      manager: new DbAuthorityManager({
        actorRepository,
        scopeRepository: new DrizzleSchedulingScopeResolver({ db }),
        eventRepository: {} as never,
        eventTimeBlockRepository: {} as never,
        ministryRepository,
      }),
    }),
    config: appConfig,
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
});

describe('builder read', () => {
  it('returns the same full board to a Ministry leader and an admin without a Volunteer profile', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'August',
      startDate: new Date('2026-08-01T00:00:00Z'),
      endDate: new Date('2026-08-31T00:00:00Z'),
      state: 'sent',
    });
    await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Sunday',
      start: new Date('2026-08-02T09:00:00Z'),
      end: new Date('2026-08-02T11:00:00Z'),
      status: 'scheduled',
    });
    const leader = await buildVolunteerWithMembership({
      db,
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Leader',
      email: `${randomUUID()}@test.com`,
      roleIds: [],
      ministryAccessLevel: 'leader',
    });
    await buildChurchMembership({
      db,
      churchId: seed.churchAId,
      userId: leader.user.id,
      accessLevel: 'member',
    });
    const admin = await buildUser({
      db,
      id: randomUUID(),
      name: 'Admin',
      email: `${randomUUID()}@test.com`,
    });
    await buildChurchMembership({
      db,
      churchId: seed.churchAId,
      userId: admin.id,
      accessLevel: 'admin',
    });
    const url = `/api/v1/assign/cycles/${cycle.id}/builder?ministryId=${seed.ministryAId}`;
    const read = async (userId: string) => {
      getSession.mockResolvedValue({
        user: { id: userId },
        session: { activeOrganizationId: seed.churchAId },
      } as never);
      return app.inject({ method: 'GET', url });
    };
    const leaderResponse = await read(leader.user.id);
    const adminResponse = await read(admin.id);
    expect(leaderResponse.statusCode).toBe(200);
    expect(adminResponse.statusCode).toBe(200);
    expect(adminResponse.json()).toEqual(leaderResponse.json());
    expect(leaderResponse.json()).toMatchObject({
      cycle: {
        id: cycle.id,
        name: 'August',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
      },
      events: [
        { event: { title: 'Sunday' }, eventTimeBlocks: expect.any(Array) },
      ],
      roles: [],
    });
  });

  it('preserves signed-out, non-manager and other-Ministry leader access decisions', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'August',
      startDate: new Date('2026-08-01T00:00:00Z'),
      endDate: new Date('2026-08-31T00:00:00Z'),
      state: 'sent',
    });
    const other = await buildMinistry({
      db,
      churchId: seed.churchAId,
      name: 'Other',
    });
    const volunteer = await buildVolunteerWithMembership({
      db,
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Volunteer',
      email: `${randomUUID()}@test.com`,
      roleIds: [],
      ministryAccessLevel: 'volunteer',
    });
    const leader = await buildVolunteerWithMembership({
      db,
      churchId: seed.churchAId,
      ministryId: other.id,
      name: 'Other leader',
      email: `${randomUUID()}@test.com`,
      roleIds: [],
      ministryAccessLevel: 'leader',
    });
    for (const userId of [volunteer.user.id, leader.user.id]) {
      await buildChurchMembership({
        db,
        churchId: seed.churchAId,
        userId,
        accessLevel: 'member',
      });
    }
    const url = `/api/v1/assign/cycles/${cycle.id}/builder?ministryId=${seed.ministryAId}`;
    const read = () => app.inject({ method: 'GET', url });
    getSession.mockResolvedValue(null as never);
    expect((await read()).statusCode).toBe(401);
    getSession.mockResolvedValue({
      user: { id: volunteer.user.id },
      session: { activeOrganizationId: seed.churchAId },
    } as never);
    expect((await read()).statusCode).toBe(403);
    const team = await buildTeam({
      db,
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Team',
    });
    await buildTeamMembership({
      db,
      churchId: seed.churchAId,
      ministryMembershipId: volunteer.membership.id,
      teamId: team.id,
      accessLevel: 'leader',
    });
    expect((await read()).statusCode).toBe(403);

    getSession.mockResolvedValue({
      user: { id: leader.user.id },
      session: { activeOrganizationId: seed.churchAId },
    } as never);
    expect((await read()).statusCode).toBe(404);
  });
});

it('keeps builder and eligible read query counts bounded as assignment history grows across Events', async () => {
  const seed = await seedSchedulingPhase3Base();
  getSession.mockResolvedValue({
    user: { id: seed.adminUserId },
    session: { activeOrganizationId: seed.churchAId },
  } as never);
  const role = await seedRole({
    churchId: seed.churchAId,
    ministryId: seed.ministryAId,
    name: 'Greeter',
  });
  const holder = await buildVolunteerWithMembership({
    db,
    churchId: seed.churchAId,
    ministryId: seed.ministryAId,
    name: 'Holder',
    email: `${randomUUID()}@test.com`,
    roleIds: [role.id],
    ministryAccessLevel: 'volunteer',
  });
  const cycle = await createSchedulingPhase3Cycle({
    churchId: seed.churchAId,
    name: 'August',
    startDate: new Date('2026-08-01Z'),
    endDate: new Date('2026-08-31Z'),
    state: 'sent',
  });
  let targetShiftId = '';
  for (let index = 0; index < 3; index++) {
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: `Target ${index}`,
      start: new Date('2026-08-02T09:00:00Z'),
      end: new Date('2026-08-02T11:00:00Z'),
      status: 'scheduled',
    });
    const target = await seedShift({
      label: 'Target',
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      eventTimeBlockId: graph.eventTimeBlock.id,
      startTime: new Date('2026-08-02T09:00:00Z'),
      endTime: new Date('2026-08-02T11:00:00Z'),
    });
    await seedRequirement({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: target.id,
      roleId: role.id,
      peopleNeeded: 1,
    });
    targetShiftId = target.id;
  }
  const history = await createSchedulingPhase3Cycle({
    churchId: seed.churchAId,
    name: 'July',
    startDate: new Date('2026-07-01Z'),
    endDate: new Date('2026-07-31Z'),
    state: 'sent',
  });
  const addHistory = async (index: number) => {
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: history.id,
      ministryId: seed.ministryAId,
      title: `Historical ${index}`,
      start: new Date('2026-07-02T09:00:00Z'),
      end: new Date('2026-07-02T11:00:00Z'),
      status: 'past',
    });
    const historicalShift = await seedShift({
      label: 'Historical',
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      eventTimeBlockId: graph.eventTimeBlock.id,
      startTime: new Date('2026-07-02T09:00:00Z'),
      endTime: new Date('2026-07-02T11:00:00Z'),
    });
    const requirement = await seedRequirement({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: historicalShift.id,
      roleId: role.id,
      peopleNeeded: 1,
    });
    await buildAssignment({
      db,
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: historicalShift.id,
      volunteerId: holder.volunteer.id,
      roleId: role.id,
      shiftRequirementId: requirement.id,
      status: 'confirmed',
    });
  };
  await addHistory(0);
  const urls = [
    `/api/v1/assign/cycles/${cycle.id}/builder?ministryId=${seed.ministryAId}`,
    `/api/v1/assign/shifts/${targetShiftId}/eligible-volunteers`,
  ];
  for (const url of urls)
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200);
  // Observe real driver statements without replacing storage or authorization.
  const queries = vi.spyOn(pg.Client.prototype, 'query');
  const readCounts = async () => {
    const counts: number[] = [];
    for (const url of urls) {
      queries.mockClear();
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('Holder');
      expect(response.body).toContain('2026-07-02T09:00:00.000Z');
      counts.push(queries.mock.calls.length);
    }
    return counts;
  };
  try {
    const smallHistory = await readCounts();
    expect(smallHistory.every((count) => count > 0)).toBe(true);
    for (let index = 1; index < 9; index++) await addHistory(index);
    const largeHistory = await readCounts();
    expect(largeHistory).toEqual(smallHistory);
  } finally {
    queries.mockRestore();
  }
});
