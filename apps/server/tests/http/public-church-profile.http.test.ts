import { appConfig } from '@church/app-config';
import { church, churchSlugHistory } from '@church/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PublicChurchProfileController } from '@/api/controllers/public-church-profile-controller';
import { DbPublicChurchProfileManager } from '@/application/db-public-church-profile-manager';
import { DbPublicEventManager } from '@/application/db-public-event-manager';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzlePublicEventRepository } from '@/infrastructure/repositories/drizzle-public-event.repository';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurch, buildChurchLogo } from '@/seeds/builders/church';
import {
  testDb as db,
  truncateAll,
} from '@/tests/integration/repositories/setup';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';
import { InMemoryObjectStorage } from '@/tests/test-support/in-memory-object-storage';

const CHURCH_A = '11111111-1111-4111-8111-111111111111';
const LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#1d4ed8"/></svg>';
const MAX_REQUESTS = appConfig.publicProfileRateLimit.maxRequests;

let app: FastifyTypedInstance;
let storage: InMemoryObjectStorage;
// Each test reads from its own client IP so the per-IP window never carries over.
let clientIp = 0;
let remoteAddress = '';

beforeAll(async () => {
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  storage = new InMemoryObjectStorage();
  const controller = new PublicChurchProfileController({
    publicChurchProfileManager: new DbPublicChurchProfileManager({
      churchRepository: new DrizzleChurchRepository({ db }),
      objectStorage: storage,
    }),
    publicEventManager: new DbPublicEventManager({
      publicEventRepository: new DrizzlePublicEventRepository({ db }),
      churchRepository: new DrizzleChurchRepository({ db }),
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
  clientIp += 1;
  remoteAddress = `203.0.113.${clientIp}`;
  storage.objects.clear();
  await truncateAll();
  await buildChurch({
    db,
    id: CHURCH_A,
    name: 'Igreja Batista Esperança',
    slug: 'ib-esperanca',
    timezone: 'America/Sao_Paulo',
  });
});

function readProfile(slug: string) {
  return app.inject({
    method: 'GET',
    url: `/api/v1/public/churches/${slug}`,
    remoteAddress,
  });
}

describe('GET /public/churches/:slug', () => {
  it('serves the identity allow-list to a visitor with no session', async () => {
    const response = await readProfile('ib-esperanca');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      slug: 'ib-esperanca',
      name: 'Igreja Batista Esperança',
      logoUrl: null,
      accentColor: null,
    });
  });

  it('serves the logo URL and accent, and nothing else of the Church', async () => {
    const logoKey = await buildChurchLogo({
      db,
      churchId: CHURCH_A,
      objectStorage: storage,
      svg: LOGO_SVG,
    });
    await db
      .update(church)
      .set({ accentColor: '#1D4ED8', website: 'https://esperanca.test' })
      .where(eq(church.id, CHURCH_A));

    const response = await readProfile('ib-esperanca');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      slug: 'ib-esperanca',
      name: 'Igreja Batista Esperança',
      logoUrl: storage.publicUrl({ key: logoKey }),
      accentColor: '#1D4ED8',
    });
  });

  it('answers an old slug with the current slug', async () => {
    await db
      .insert(churchSlugHistory)
      .values({ slug: 'esperanca-antiga', churchId: CHURCH_A });

    const response = await readProfile('esperanca-antiga');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      slug: 'ib-esperanca',
      name: 'Igreja Batista Esperança',
      logoUrl: null,
      accentColor: null,
    });
  });

  it('answers an unknown slug with 404', async () => {
    const response = await readProfile('nao-existe');

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'NOT_FOUND',
      message: 'Não encontramos o que você pediu.',
    });
  });

  it('answers 429 once a client IP is over the limit', async () => {
    for (let attempt = 0; attempt < MAX_REQUESTS; attempt += 1) {
      expect((await readProfile('ib-esperanca')).statusCode).toBe(200);
    }

    const limited = await readProfile('ib-esperanca');

    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({
      error: 'RATE_LIMITED',
      message: 'Muitas tentativas. Tente novamente em instantes.',
    });
    remoteAddress = '198.51.100.1';
    expect((await readProfile('ib-esperanca')).statusCode).toBe(200);
  });
});
