import { appConfig, withAllParkedOn } from '@church/app-config';
import { describe, expect, it } from 'vitest';
import type { MinistryInvitationRepository } from '@/domain/contracts/infrastructure/ministry-invitation.repository';
import { CaptureEmailSender } from '@/infrastructure/services/capture-email-sender';
import {
  type CompositionRootDependencies,
  createCompositionRoot,
} from '@/main/di/composition-root';
import { registerControllers } from '@/main/fastify/register-controllers';
import { createFastify } from '@/main/fastify/setup';

async function registeredRoutes(
  overrides?: Partial<CompositionRootDependencies>,
): Promise<string[]> {
  const { controllers } = createCompositionRoot(overrides);
  const app = await createFastify();
  const routes: string[] = [];
  app.addHook('onRoute', (route) => {
    for (const method of [route.method].flat()) {
      routes.push(`${method} ${route.url}`);
    }
  });
  await app.register(
    async (instance) => registerControllers({ app: instance, controllers }),
    { prefix: '/api/v1' },
  );
  await app.ready();
  await app.close();
  return routes;
}

const PARKED_ROUTES = [
  'PATCH /api/v1/volunteer/assignments/:assignmentId',
  'POST /api/v1/volunteer/assignments/:assignmentId/cancel',
  'GET /api/v1/assign/cycles/:cycleId/audit',
];

describe('composition root', () => {
  it('registers at least one route under every controller prefix', async () => {
    const routes = await registeredRoutes();
    const prefixes = [
      'active-church',
      'admin',
      'events',
      'ministries',
      'redemption',
      'assign',
      'caller-capabilities',
      'prepare',
      'volunteer',
    ];
    for (const prefix of prefixes) {
      expect(
        routes.some((route) => route.includes(` /api/v1/${prefix}`)),
        prefix,
      ).toBe(true);
    }
  });

  it('builds ten controllers', () => {
    const { controllers } = createCompositionRoot();
    expect(controllers).toHaveLength(10);
    expect(new Set(controllers.map((c) => c.constructor)).size).toBe(10);
  });

  it('reads the debug code back from an overridden capture email sender', async () => {
    const emailSender = new CaptureEmailSender();
    await emailSender.send({
      payload: {
        kind: 'invitation.verification-code',
        to: 'invitee@example.com',
        churchName: 'Church',
        code: '123456',
      },
    });
    const { controllers } = createCompositionRoot({
      emailSender,
      ministryInvitationRepository: {
        findPublicRedemptionPreview: async () => ({
          email: 'invitee@example.com',
          churchName: 'Church',
        }),
      } as unknown as MinistryInvitationRepository,
    });
    const app = await createFastify();
    await app.register(
      async (instance) => registerControllers({ app: instance, controllers }),
      { prefix: '/api/v1' },
    );
    await app.ready();
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/redemption/church/${crypto.randomUUID()}/debug-code`,
    });
    await app.close();
    expect(response.json()).toEqual({ code: '123456' });
  });

  it('leaves parked routes out by default', async () => {
    const routes = await registeredRoutes();
    for (const parked of PARKED_ROUTES) {
      expect(routes).not.toContain(parked);
    }
  });

  it('registers parked routes when every switch is on', async () => {
    const routes = await registeredRoutes({
      config: withAllParkedOn(appConfig),
    });
    for (const parked of PARKED_ROUTES) {
      expect(routes).toContain(parked);
    }
  });
});
