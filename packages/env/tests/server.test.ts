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

  it('defaults CHURCH_ENVIRONMENT to local and rejects an unknown one', async () => {
    expect((await parse({})).CHURCH_ENVIRONMENT).toBe('local');
    expect(
      (await parse({ CHURCH_ENVIRONMENT: 'staging' })).CHURCH_ENVIRONMENT,
    ).toBe('staging');
    expect(await invalidIssues({ CHURCH_ENVIRONMENT: 'qa' })).toContain(
      'CHURCH_ENVIRONMENT',
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

describe('server env: APP_REVISION', () => {
  it('reports an unversioned local run when no image revision is set', async () => {
    expect((await parse({})).APP_REVISION).toBe('unversioned');
  });

  it('keeps the revision a deployed image supplies', async () => {
    const revision = 'a'.repeat(40);
    expect((await parse({ APP_REVISION: revision })).APP_REVISION).toBe(
      revision,
    );
  });
});

describe('server env: observability', () => {
  it('defaults to info logs, no trace export and a sample rate of 1', async () => {
    const env = await parse({
      LOG_LEVEL: '',
      OTEL_EXPORTER_OTLP_ENDPOINT: '',
      TRACE_SAMPLE_RATE: '',
    });
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
    expect(env.TRACE_SAMPLE_RATE).toBe(1);
  });

  it.each([
    ['LOG_LEVEL', 'loud'],
    ['OTEL_EXPORTER_OTLP_ENDPOINT', 'not-a-url'],
    ['TRACE_SAMPLE_RATE', '1.5'],
    ['TRACE_SAMPLE_RATE', '-0.1'],
  ])('rejects %s=%s', async (key, value) => {
    expect(await invalidIssues({ [key]: value })).toContain(key);
  });
});

describe('server env: error reporting', () => {
  it('has no DSN and the switch on by default', async () => {
    const env = await parse({});
    expect(env.SENTRY_DSN).toBeUndefined();
    expect(env.ERROR_REPORTING_ENABLED).toBe(true);
  });

  it('reads the DSN and the switch', async () => {
    const env = await parse({
      SENTRY_DSN: 'https://key@tracker.test/1',
      ERROR_REPORTING_ENABLED: 'false',
    });
    expect(env.SENTRY_DSN).toBe('https://key@tracker.test/1');
    expect(env.ERROR_REPORTING_ENABLED).toBe(false);
  });

  it('rejects a DSN that is not a URL', async () => {
    expect(await invalidIssues({ SENTRY_DSN: 'not a url' })).toContain(
      'SENTRY_DSN',
    );
  });
});
