import { env } from '@church/env/server';
import { hashPassword } from 'better-auth/crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurch, buildChurchMembership } from '@/seeds/builders/church';
import { buildAuthenticatableUser } from '@/seeds/builders/identity';
import { testDb, truncateAll } from '@/tests/integration/repositories/setup';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';

const PASSWORD = 'organization-routes-password';

interface FixturePerson {
  userId: string;
  email: string;
  cookie: string;
}

interface Fixture {
  churchId: string;
  admin: FixturePerson;
  member: FixturePerson;
}

interface SignInInput {
  email: string;
}

interface CreatePersonInput {
  key: string;
  churchId: string;
  accessLevel: 'admin' | 'member';
}

interface SessionUserBody {
  email: string;
}

interface SessionBody {
  user: SessionUserBody;
}

let app: FastifyTypedInstance;
let fixture: Fixture;
let passwordHash: string;

async function signIn({ email }: SignInInput): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: env.CORS_ORIGIN },
    payload: { email, password: PASSWORD },
  });
  expect(response.statusCode).toBe(200);
  const setCookies = [response.headers['set-cookie']].flat() as string[];
  return setCookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

async function createPerson({
  key,
  churchId,
  accessLevel,
}: CreatePersonInput): Promise<FixturePerson> {
  const userId = crypto.randomUUID();
  const email = `${key}@organization-routes.example.test`;
  await buildAuthenticatableUser({
    db: testDb,
    id: userId,
    name: key,
    email,
    passwordHash,
  });
  await buildChurchMembership({ db: testDb, churchId, userId, accessLevel });
  return { userId, email, cookie: await signIn({ email }) };
}

beforeAll(async () => {
  await truncateAll();
  passwordHash = await hashPassword(PASSWORD);
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  await app.ready();
  const churchId = crypto.randomUUID();
  await buildChurch({
    db: testDb,
    id: churchId,
    name: 'Organization Routes Church',
    slug: 'organization-routes-church',
    timezone: 'UTC',
  });
  fixture = {
    churchId,
    admin: await createPerson({ key: 'admin', churchId, accessLevel: 'admin' }),
    member: await createPerson({
      key: 'member',
      churchId,
      accessLevel: 'member',
    }),
  };
});

afterAll(async () => {
  await app.close();
});

describe('Better Auth session routes the web app calls', () => {
  it('keeps a signed-in Church Member session readable', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: fixture.member.cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<SessionBody>().user.email).toBe(fixture.member.email);
  });
});
