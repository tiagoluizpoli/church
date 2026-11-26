import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AssignController } from '@/api/controllers/assign-controller';
import { ChurchAdminController } from '@/api/controllers/church-admin-controller';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@/main/di/server-auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue({
        user: { id: 'user-1' },
        session: { activeOrganizationId: null },
      }),
    },
  },
}));

const CHURCH_ID = '11111111-1111-4111-8111-111111111111';
const UNPROCESSABLE = 422;

const activeChurchResolver = {
  resolve: vi.fn().mockResolvedValue({
    status: 'resolved',
    churchId: CHURCH_ID,
    volunteerId: null,
    autoSelected: false,
  }),
};
// Managers are empty on purpose: a malformed id must be refused before any
// manager runs, so reaching one would surface as a 500 TypeError.
const authorityGuard = {
  canManageChurch: vi.fn().mockResolvedValue(true),
  decideManageMinistry: vi.fn().mockResolvedValue({ allowed: true }),
};

const ROUTES = [
  ['GET', '/api/v1/admin/cycles/not-a-uuid'],
  ['PATCH', '/api/v1/admin/cycles/not-a-uuid'],
  ['DELETE', '/api/v1/admin/cycles/not-a-uuid'],
  ['GET', '/api/v1/admin/event-templates/not-a-uuid'],
  ['PUT', '/api/v1/admin/event-templates/not-a-uuid/precedences/not-a-uuid'],
  ['POST', '/api/v1/admin/cycles/not-a-uuid/events/not-a-uuid/edit/preview'],
  ['POST', '/api/v1/admin/cycles/not-a-uuid/events/not-a-uuid/edit'],
  ['PATCH', '/api/v1/admin/ministries/not-a-uuid/default-direction'],
  ['GET', '/api/v1/assign/cycles/not-a-uuid/builder'],
  ['GET', `/api/v1/assign/cycles/${CHURCH_ID}/builder?ministryId=not-a-uuid`],
  ['GET', '/api/v1/assign/shifts/not-a-uuid/eligible-volunteers'],
  ['DELETE', '/api/v1/assign/assignments/not-a-uuid'],
  ['GET', '/api/v1/assign/participations/not-a-uuid/completion'],
] as const;

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  const admin = new ChurchAdminController({
    cycleManager: {} as never,
    eventTemplateManager: {} as never,
    planningEventManager: {} as never,
    activeChurchResolver: activeChurchResolver as never,
    ministryManager: {} as never,
    setupProgressManager: {} as never,
    authorityGuard: authorityGuard as never,
  });
  const assign = new AssignController({
    scheduleBuilderReader: {} as never,
    assignmentProposalManager: {} as never,
    schedulePublisher: {} as never,
    scheduleReadModel: {} as never,
    assignmentManager: {} as never,
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard: authorityGuard as never,
    config: { parked: {} } as never,
  });
  await app.register(
    async (instance) => {
      for (const controller of [admin, assign]) {
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

describe('route id params', () => {
  it.each(
    ROUTES,
  )('%s %s answers 422 for a malformed id', async (method, url) => {
    const response = await app.inject({ method, url, payload: {} as never });

    expect(response.statusCode).toBe(UNPROCESSABLE);
  });
});
