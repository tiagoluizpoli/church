import { appConfig, withAllParkedOn } from '@church/app-config';
import { describe, expect, it } from 'vitest';
import {
  type CompositionRootDependencies,
  createCompositionRoot,
} from '../../src/main/di/composition-root';
import { registerControllers } from '../../src/main/fastify/register-controllers';
import { createFastify } from '../../src/main/fastify/setup';

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
  'GET /api/v1/rostering/cycles/:cycleId/audit',
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
      'rostering',
      'scheduling',
      'tailoring',
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
    expect(createCompositionRoot().controllers).toHaveLength(10);
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
