import { randomUUID } from 'node:crypto';
import { appConfig, withAllParkedOn } from '@church/app-config';
import { ministryParticipation } from '@church/db';
import { m } from '@church/i18n/messages';
import { eq } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AssignController } from '@/api/controllers/assign-controller';
import { PrepareController } from '@/api/controllers/prepare-controller';
import { DbAvailabilityCheckManager } from '@/application';
import { DrizzleAvailabilityCheckRepository } from '@/infrastructure/repositories/drizzle-availability-check.repository';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleCycleRepository } from '@/infrastructure/repositories/drizzle-cycle.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleMinistryParticipationRepository } from '@/infrastructure/repositories/drizzle-ministry-participation.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { createSchedulingManagers } from '@/tests/application/scheduling-schedule.helpers';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';
import { createChurchNotificationsSpy } from '@/tests/test-support/church-notifications-spy';
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockGetSession = vi.mocked(
  (await import('@/main/di/server-auth')).auth.api.getSession,
);

const activeChurchResolver = { resolve: vi.fn() };
const authorityGuard = {
  decideManageMinistry: vi.fn(),
  decideManageAnyMinistry: vi.fn(),
};

let app: FastifyTypedInstance;

beforeAll(async () => {
  const managers = createSchedulingManagers();
  const availabilityCheckManager = new DbAvailabilityCheckManager({
    participationRepository: new DrizzleMinistryParticipationRepository({
      db: schedulingTestDb,
    }),
    availabilityCheckRepository: new DrizzleAvailabilityCheckRepository({
      db: schedulingTestDb,
    }),
    cycleRepository: new DrizzleCycleRepository({ db: schedulingTestDb }),
    ministryRepository: new DrizzleMinistryRepository({ db: schedulingTestDb }),
    churchRepository: new DrizzleChurchRepository({ db: schedulingTestDb }),
    notifications: createChurchNotificationsSpy(),
    unitOfWork: new DrizzleUnitOfWork({ db: schedulingTestDb }),
    config: appConfig,
  });
  app = await createFastify({ locale: testLocale });
  const assign = new AssignController({
    participationManager: managers.participationManager,
    assignmentManager: managers.assignmentManager,
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard: authorityGuard as never,
    config: withAllParkedOn(appConfig),
  });
  const prepare = new PrepareController({
    participationManager: managers.participationManager,
    availabilityCheckManager,
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard: authorityGuard as never,
  });
  await app.register(
    async (instance) => {
      instance.register(assign.registerRoutes.bind(assign), {
        prefix: assign.prefix,
      });
      instance.register(prepare.registerRoutes.bind(prepare), {
        prefix: prepare.prefix,
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

async function seedCycleScope() {
  const seed = await seedSchedulingPhase3Base();
  mockGetSession.mockResolvedValue({
    user: { id: seed.adminUserId },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: seed.churchAId,
    volunteerId: seed.adminVolunteerId,
    hasVolunteerMembership: true,
    autoSelected: false,
  });
  authorityGuard.decideManageMinistry.mockResolvedValue({ allowed: true });
  const foreignCycle = await createSchedulingPhase3Cycle({
    churchId: seed.churchBId,
    name: 'Foreign cycle',
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: new Date('2026-10-01T00:00:00.000Z'),
  });
  return {
    churchId: seed.churchAId,
    ministryId: seed.ministryAId,
    foreignCycleId: foreignCycle.id,
  };
}

const routes = [
  ['GET', 'prepare', 'participation'],
  ['GET', 'prepare', 'availability-status'],
  ['GET', 'assign', 'builder'],
  ['GET', 'assign', 'audit'],
  ['POST', 'assign', 'publish'],
  ['POST', 'assign', 'send-updates'],
] as const;

describe('Schedule publish authorization and refusals', () => {
  it.each([
    'publish',
    'send-updates',
  ])('returns 401 and 403 for %s without session or authority', async (action) => {
    const seed = await seedCycleScope();
    const url = `/api/v1/assign/cycles/${randomUUID()}/${action}?ministryId=${seed.ministryId}`;
    mockGetSession.mockResolvedValueOnce(null);
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          payload: { confirmBelowFull: true },
        })
      ).statusCode,
    ).toBe(401);
    authorityGuard.decideManageMinistry.mockResolvedValue({ allowed: false });
    authorityGuard.decideManageAnyMinistry.mockResolvedValue({
      allowed: false,
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          payload: { confirmBelowFull: true },
        })
      ).statusCode,
    ).toBe(403);
    authorityGuard.decideManageAnyMinistry.mockResolvedValue({ allowed: true });
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          payload: { confirmBelowFull: true },
        })
      ).statusCode,
    ).toBe(404);
  });

  it('returns the empty-Schedule 409 over the publish endpoint', async () => {
    const seed = await seedCycleScope();
    const scope = await createSchedulingPhase3Cycle({
      churchId: seed.churchId,
      name: 'Future',
      startDate: new Date('2035-01-01T00:00:00Z'),
      endDate: new Date('2035-02-01T00:00:00Z'),
      state: 'sent',
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchId,
      cycleId: scope.id,
      ministryId: seed.ministryId,
      title: 'Future Event',
      start: new Date('2035-01-10T10:00:00Z'),
      end: new Date('2035-01-10T12:00:00Z'),
    });
    await schedulingTestDb
      .update(ministryParticipation)
      .set({ state: 'assigning' })
      .where(eq(ministryParticipation.id, graph.participation.id));
    const result = await app.inject({
      method: 'POST',
      url: `/api/v1/assign/cycles/${scope.id}/publish?ministryId=${seed.ministryId}`,
      payload: { confirmBelowFull: true },
    });
    expect(result.statusCode).toBe(409);
    expect(result.json()).toMatchObject({
      error: 'SCHEDULE_HAS_NO_ASSIGNMENTS',
    });
    const send = await app.inject({
      method: 'POST',
      url: `/api/v1/assign/cycles/${scope.id}/send-updates?ministryId=${seed.ministryId}`,
    });
    expect(send.statusCode).toBe(409);
    expect(send.json()).toMatchObject({ error: 'NO_UNSENT_CHANGES' });
  });
});

describe('Cycle-scoped Prepare/Assign routes', () => {
  it.each(
    routes,
  )('%s /%s/cycles/:cycleId/%s returns the same 404 for a missing and a foreign-Church Cycle', async (method, area, leaf) => {
    const seed = await seedCycleScope();
    const missingCycleId = randomUUID();
    const call = (cycleId: string) =>
      app.inject({
        method,
        url: `/api/v1/${area}/cycles/${cycleId}/${leaf}?ministryId=${seed.ministryId}`,
        ...(method === 'POST' && { payload: { confirmBelowFull: true } }),
      });

    const missing = await call(missingCycleId);
    const foreign = await call(seed.foreignCycleId);

    expect(missing.statusCode).toBe(404);
    expect(foreign.statusCode).toBe(404);
    expect(missing.json().error).toBe('NOT_FOUND');
    expect(foreign.json().error).toBe('NOT_FOUND');
    expect(missing.json().message).toBe(m.error_not_found());
    expect(foreign.json()).toEqual(missing.json());
    expect(await schedulingTestDb.select().from(ministryParticipation)).toEqual(
      [],
    );
  });
});
