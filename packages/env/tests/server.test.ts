import { afterEach, describe, expect, it, vi } from 'vitest';

const baseEnv = {
  DATABASE_URL: 'postgres://localhost/church',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
  CORS_ORIGIN: 'http://localhost:5173',
  NODE_ENV: 'development',
};

async function parse(overrides: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries({ ...baseEnv, ...overrides })) {
    vi.stubEnv(key, value);
  }
  return (await import('../src/server')).env;
}

/** Parses invalid env and returns the issues the parser logged for it. */
async function invalidIssues(overrides: Record<string, string>) {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  await expect(parse(overrides)).rejects.toThrow('Invalid environment');
  return JSON.stringify(logged.mock.calls);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('server env: development email', () => {
  it('defaults to SMTP on the local Mailpit port with no sender chosen', async () => {
    const env = await parse({});
    expect(env.DEV_EMAIL_SENDER).toBeUndefined();
    expect(env.SMTP_HOST).toBe('localhost');
    expect(env.SMTP_PORT).toBe(1025);
    expect(env.SMTP_SECURE).toBe(false);
    expect(env.SMTP_REQUIRE_TLS).toBe(false);
  });

  it.each([
    'smtp',
    'resend',
    'capture',
  ])('accepts DEV_EMAIL_SENDER=%s', async (sender) => {
    const env = await parse({ DEV_EMAIL_SENDER: sender });
    expect(env.DEV_EMAIL_SENDER).toBe(sender);
  });

  it('treats an empty DEV_EMAIL_SENDER as unset', async () => {
    const env = await parse({ DEV_EMAIL_SENDER: '' });
    expect(env.DEV_EMAIL_SENDER).toBeUndefined();
  });

  it('rejects an unknown DEV_EMAIL_SENDER', async () => {
    expect(await invalidIssues({ DEV_EMAIL_SENDER: 'sendgrid' })).toContain(
      'DEV_EMAIL_SENDER',
    );
  });

  it('parses a complete SMTP configuration', async () => {
    const env = await parse({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
      SMTP_REQUIRE_TLS: 'true',
      SMTP_USER: 'mailer',
      SMTP_PASSWORD: 'secret',
      SMTP_FROM_EMAIL: 'Church <hi@example.com>',
    });
    expect(env).toMatchObject({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: 587,
      SMTP_SECURE: false,
      SMTP_REQUIRE_TLS: true,
      SMTP_USER: 'mailer',
      SMTP_PASSWORD: 'secret',
      SMTP_FROM_EMAIL: 'Church <hi@example.com>',
    });
  });

  it.each(['0', '-1', '25.5', 'smtp'])('rejects SMTP_PORT=%s', async (port) => {
    expect(await invalidIssues({ SMTP_PORT: port })).toContain('SMTP_PORT');
  });

  it.each([
    'SMTP_SECURE',
    'SMTP_REQUIRE_TLS',
  ])('rejects a non-boolean %s', async (name) => {
    expect(await invalidIssues({ [name]: 'maybe' })).toContain(name);
  });
});
