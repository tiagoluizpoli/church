import { randomUUID } from 'node:crypto';
import { appConfig, withAllParkedOn } from '@church/app-config';
import { ministryParticipation } from '@church/db';
import { m } from '@church/i18n/messages';
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
import { DrizzleCycleRepository } from '@/infrastructure/repositories/drizzle-cycle.repository';
import { DrizzleMinistryParticipationRepository } from '@/infrastructure/repositories/drizzle-ministry-participation.repository';
import { DrizzlePlanningEventRepository } from '@/infrastructure/repositories/drizzle-planning-event.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { createSchedulingManagers } from '@/tests/application/scheduling-schedule.helpers';
import {
  createSchedulingPhase3Cycle,
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
const authorityGuard = { decideManageMinistry: vi.fn() };

let app: FastifyTypedInstance;

beforeAll(async () => {
  const managers = createSchedulingManagers();
  const availabilityCheckManager = new DbAvailabilityCheckManager({
    participationRepository: new DrizzleMinistryParticipationRepository({
      db: schedulingTestDb,
    }),
    eventRepository: new DrizzlePlanningEventRepository({
      db: schedulingTestDb,
    }),
    availabilityCheckRepository: new DrizzleAvailabilityCheckRepository({
      db: schedulingTestDb,
    }),
    cycleRepository: new DrizzleCycleRepository({ db: schedulingTestDb }),
    notifications: createChurchNotificationsSpy(),
    unitOfWork: new DrizzleUnitOfWork({ db: schedulingTestDb }),
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
  return { ministryId: seed.ministryAId, foreignCycleId: foreignCycle.id };
}

const routes = [
  ['GET', 'prepare', 'participation'],
  ['GET', 'prepare', 'availability-status'],
  ['GET', 'assign', 'builder'],
  ['GET', 'assign', 'audit'],
  ['POST', 'assign', 'publish'],
] as const;

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
