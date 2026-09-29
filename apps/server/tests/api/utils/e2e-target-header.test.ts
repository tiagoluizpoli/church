import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  E2E_TARGET_HEADER,
  registerE2eTargetHeader,
} from '../../../src/api/utils/e2e-target-header';

// #253: the redemption journeys prove an invitation was provisioned and
// redeemed against the run's pinned target by reading this header off the
// real server responses.
const E2E_URL =
  'postgresql://postgres:secret-password@localhost:5432/church_unspecified_e2e?sslmode=disable';
const FINGERPRINT =
  'purpose=e2e worktree=unspecified host=localhost port=5432 database=church_unspecified_e2e';

type FastifyFactory = () => FastifyInstance;
const createFastifyInstance = Fastify as unknown as FastifyFactory;

interface BuildAppInput {
  enabled: boolean;
}

async function buildApp({ enabled }: BuildAppInput): Promise<FastifyInstance> {
  const app = createFastifyInstance();
  registerE2eTargetHeader({ app, enabled });
  app.get('/probe', async () => ({ ok: true }));
  await app.ready();
  return app;
}

function resetEnv(): void {
  delete process.env.CHURCH_EXEC_PURPOSE;
  delete process.env.DATABASE_URL;
  delete process.env.CHURCH_WORKTREE;
}

describe('registerE2eTargetHeader', () => {
  afterEach(resetEnv);

  it('stamps every response with the redacted E2E target the server resolved', async () => {
    process.env.CHURCH_EXEC_PURPOSE = 'e2e';
    process.env.DATABASE_URL = E2E_URL;
    const app = await buildApp({ enabled: true });

    const response = await app.inject({ method: 'GET', url: '/probe' });

    expect(response.headers[E2E_TARGET_HEADER]).toBe(FINGERPRINT);
    expect(JSON.stringify(response.headers)).not.toContain('secret-password');
    expect(JSON.stringify(response.headers)).not.toContain('sslmode');
    await app.close();
  });

  it('stamps responses the app did not route, so failures carry the target too', async () => {
    process.env.CHURCH_EXEC_PURPOSE = 'e2e';
    process.env.DATABASE_URL = E2E_URL;
    const app = await buildApp({ enabled: true });

    const response = await app.inject({ method: 'GET', url: '/missing' });

    expect(response.statusCode).toBe(404);
    expect(response.headers[E2E_TARGET_HEADER]).toBe(FINGERPRINT);
    await app.close();
  });

  it('adds nothing when debug endpoints are disabled', async () => {
    process.env.CHURCH_EXEC_PURPOSE = 'e2e';
    process.env.DATABASE_URL = E2E_URL;
    const app = await buildApp({ enabled: false });

    const response = await app.inject({ method: 'GET', url: '/probe' });

    expect(response.headers[E2E_TARGET_HEADER]).toBeUndefined();
    await app.close();
  });

  it('adds nothing outside the e2e purpose', async () => {
    process.env.CHURCH_EXEC_PURPOSE = 'development';
    process.env.DATABASE_URL = E2E_URL;
    const app = await buildApp({ enabled: true });

    const response = await app.inject({ method: 'GET', url: '/probe' });

    expect(response.headers[E2E_TARGET_HEADER]).toBeUndefined();
    await app.close();
  });

  it('refuses to start an e2e server pointed at a non-E2E database', () => {
    process.env.CHURCH_EXEC_PURPOSE = 'e2e';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/church';

    expect(() =>
      registerE2eTargetHeader({ app: createFastifyInstance(), enabled: true }),
    ).toThrow();
  });
});
