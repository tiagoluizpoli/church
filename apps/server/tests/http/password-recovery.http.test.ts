import { account, session, user, verification } from '@church/db';
import { env } from '@church/env/server';
import { hashPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PasswordResetEmail } from '@/domain/contracts/infrastructure/email-sender';
import { CaptureEmailSender } from '@/infrastructure/services/capture-email-sender';
import { createCompositionRoot } from '@/main/di/composition-root';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildAuthenticatableUser } from '@/seeds/builders/identity';
import { testDb, truncateAll } from '@/tests/integration/repositories/setup';
import { testLocale } from '@/tests/test-support/fastify-locale';

const EMAIL = 'forgetful@example.test';
const OLD_PASSWORD = 'old-password-123';
const NEW_PASSWORD = 'new-password-456';
const ONE_HOUR_SECONDS = 3600;
const EXPIRY_TOLERANCE_SECONDS = 60;
const MS_PER_SECOND = 1000;

let app: FastifyTypedInstance;
let capture: CaptureEmailSender;

beforeEach(async () => {
  await truncateAll();
  await buildAuthenticatableUser({
    db: testDb,
    id: crypto.randomUUID(),
    name: 'Forgetful',
    email: EMAIL,
    passwordHash: await hashPassword(OLD_PASSWORD),
  });
  capture = new CaptureEmailSender('Church');
  const root = createCompositionRoot({ emailSender: capture });
  app = await createFastify({ locale: testLocale, auth: root.auth });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

interface PostInput {
  url: string;
  payload: Record<string, unknown>;
  cookie?: string;
}

function post({ url, payload, cookie }: PostInput) {
  return app.inject({
    method: 'POST',
    url,
    payload,
    headers: { origin: env.CORS_ORIGIN, ...(cookie && { cookie }) },
  });
}

function signIn({ email, password }: { email: string; password: string }) {
  return post({ url: '/api/auth/sign-in/email', payload: { email, password } });
}

async function sessionCookie(): Promise<string> {
  const response = await signIn({ email: EMAIL, password: OLD_PASSWORD });
  expect(response.statusCode).toBe(200);
  const setCookies = [response.headers['set-cookie']].flat() as string[];
  return setCookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

async function hasSession({ cookie }: { cookie: string }): Promise<boolean> {
  const response = await app.inject({
    method: 'GET',
    url: '/api/auth/get-session',
    headers: { cookie },
  });
  return response.json() !== null;
}

function requestReset({ email }: { email: string }) {
  return post({
    url: '/api/auth/request-password-reset',
    payload: { email, redirectTo: `${env.CORS_ORIGIN}/reset-password` },
  });
}

async function capturedReset(): Promise<PasswordResetEmail> {
  await vi.waitFor(() => expect(capture.sent).toHaveLength(1));
  return capture.sent[0] as PasswordResetEmail;
}

async function capturedToken(): Promise<string> {
  const { resetUrl } = await capturedReset();
  return new URL(resetUrl).searchParams.get('token') as string;
}

function resetPassword({
  token,
  newPassword,
}: {
  token: string;
  newPassword: string;
}) {
  return post({
    url: '/api/auth/reset-password',
    payload: { token, newPassword },
  });
}

describe('password recovery over HTTP', () => {
  it('answers a known and an unknown address identically; only the known one gets mail', async () => {
    const known = await requestReset({ email: EMAIL });
    const unknown = await requestReset({ email: 'nobody@example.test' });

    expect(unknown.statusCode).toBe(known.statusCode);
    expect(unknown.json()).toEqual(known.json());
    const reset = await capturedReset();
    expect(reset.to).toBe(EMAIL);
    expect(
      await testDb
        .select()
        .from(user)
        .where(eq(user.email, 'nobody@example.test')),
    ).toHaveLength(0);
    expect(capture.sent).toHaveLength(1);
  });

  it('emails an absolute configured-origin link with a one-hour lifetime and enforces it', async () => {
    await requestReset({ email: EMAIL });

    const { resetUrl, linkLifetime } = await capturedReset();
    expect(
      resetUrl.startsWith(`${env.CORS_ORIGIN}/reset-password?token=`),
    ).toBe(true);
    expect(linkLifetime).toEqual({ hours: 1 });
    const [row] = await testDb.select().from(verification);
    const secondsLeft =
      ((row?.expiresAt as Date).getTime() - Date.now()) / MS_PER_SECOND;
    expect(secondsLeft).toBeGreaterThan(
      ONE_HOUR_SECONDS - EXPIRY_TOLERANCE_SECONDS,
    );
    expect(secondsLeft).toBeLessThanOrEqual(ONE_HOUR_SECONDS);
  });

  it('changes the password, revokes every old session and creates no new one', async () => {
    const cookies = [await sessionCookie(), await sessionCookie()];
    for (const cookie of cookies) {
      expect(await hasSession({ cookie })).toBe(true);
    }
    await requestReset({ email: EMAIL });
    const token = await capturedToken();

    const reset = await resetPassword({ token, newPassword: NEW_PASSWORD });

    expect(reset.statusCode).toBe(200);
    expect(reset.headers['set-cookie']).toBeUndefined();
    for (const cookie of cookies) {
      expect(await hasSession({ cookie })).toBe(false);
    }
    expect(await testDb.select().from(session)).toHaveLength(0);
    expect(
      (await signIn({ email: EMAIL, password: OLD_PASSWORD })).statusCode,
    ).toBe(401);
    expect(
      (await signIn({ email: EMAIL, password: NEW_PASSWORD })).statusCode,
    ).toBe(200);
  });

  it('refuses a used token, an expired token and a malformed token', async () => {
    await requestReset({ email: EMAIL });
    const token = await capturedToken();
    expect(
      (await resetPassword({ token, newPassword: NEW_PASSWORD })).statusCode,
    ).toBe(200);

    const reused = await resetPassword({
      token,
      newPassword: 'another-pass-789',
    });
    expect(reused.statusCode).toBe(400);
    expect(reused.json().code).toBe('INVALID_TOKEN');

    capture.sent.length = 0;
    await requestReset({ email: EMAIL });
    const expiring = await capturedToken();
    await testDb
      .update(verification)
      .set({ expiresAt: new Date(Date.now() - MS_PER_SECOND) });
    const expired = await resetPassword({
      token: expiring,
      newPassword: 'another-pass-789',
    });
    expect(expired.statusCode).toBe(400);
    expect(expired.json().code).toBe('INVALID_TOKEN');

    const malformed = await resetPassword({
      token: 'not-a-token',
      newPassword: NEW_PASSWORD,
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().code).toBe('INVALID_TOKEN');
  });

  it('refuses too short and too long passwords without changing anything', async () => {
    const cookie = await sessionCookie();
    expect(await hasSession({ cookie })).toBe(true);
    await requestReset({ email: EMAIL });
    const token = await capturedToken();

    const short = await resetPassword({ token, newPassword: 'short' });
    const long = await resetPassword({ token, newPassword: 'x'.repeat(129) });

    expect(short.json().code).toBe('PASSWORD_TOO_SHORT');
    expect(long.json().code).toBe('PASSWORD_TOO_LONG');
    expect(await hasSession({ cookie })).toBe(true);
    expect(
      (await signIn({ email: EMAIL, password: OLD_PASSWORD })).statusCode,
    ).toBe(200);
    const [credential] = await testDb.select().from(account);
    expect(credential?.password).toBeTruthy();
  });
});
