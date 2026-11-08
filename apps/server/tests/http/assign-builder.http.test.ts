import { randomUUID } from 'node:crypto';
import { appConfig } from '@church/app-config';
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
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import { buildMinistry } from '@/seeds/builders/ministry';
import { buildVolunteerWithMembership } from '@/seeds/builders/volunteer';
import { createSchedulingManagers } from '@/tests/application/scheduling-schedule.helpers';
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
        scopeRepository: {} as never,
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
    getSession.mockResolvedValue({
      user: { id: leader.user.id },
      session: { activeOrganizationId: seed.churchAId },
    } as never);
    expect((await read()).statusCode).toBe(404);
  });
});
