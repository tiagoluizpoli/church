// biome-ignore-all lint/style/useNamingConvention: Sentry event fields are snake_case on the wire
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { z } from 'zod';
import { OverlappingCycleError } from '@/domain/errors/overlapping-cycle';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import {
  type CapturedReports,
  captureErrorReports,
  REPORT_ENVIRONMENT,
  REPORT_REVISION,
} from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const EMAIL = 'ana.member@example.test';
const NAME = 'Ana Member';
const IP = '203.0.113.9';
const COOKIE_SECRET = 'SESSION-SECRET';
const BEARER_SECRET = 'BEARER-SECRET';
const BODY_SECRET = 'body-secret-password';
const QUERY_SECRET = 'query-secret';

let app: FastifyTypedInstance;
let reports: CapturedReports;

beforeAll(async () => {
  reports = captureErrorReports();
  app = await createFastify({ locale: testLocale });
  app.addHook('preHandler', async (request) => {
    request.userId = 'user_1';
    request.churchId = 'church_1';
  });
  app.post('/boom/crash/:eventId', async () => {
    throw new Error(`failed for ${EMAIL} (${NAME})`);
  });
  app.get(
    '/boom/serialization',
    { schema: { response: { 200: z.object({ id: z.string() }) } } },
    async () => ({ id: 1 }) as never,
  );
  app.get('/boom/domain', async () => {
    throw new OverlappingCycleError({ conflictingCycles: [] });
  });
  app.get('/boom/connection', async () => {
    throw Object.assign(new Error('connection failed'), {
      code: 'ECONNREFUSED',
    });
  });
  await app.ready();
});

afterAll(async () => app.close());

beforeEach(() => reports.clear());

const inject = (method: 'GET' | 'POST', url: string) =>
  app.inject({
    method,
    url,
    remoteAddress: IP,
    headers: {
      traceparent: `00-${TRACE_ID}-00f067aa0ba902b7-01`,
      cookie: `better-auth.session_token=${COOKIE_SECRET}`,
      authorization: `Bearer ${BEARER_SECRET}`,
      'user-agent': 'reporting-test',
    },
    ...(method === 'POST' && {
      payload: { email: EMAIL, name: NAME, password: BODY_SECRET },
    }),
  });

describe('server error reporting', () => {
  it('reports an unhandled error once, tagged, with ids only', async () => {
    const res = await inject(
      'POST',
      `/boom/crash/event_9?email=${EMAIL}&q=${QUERY_SECRET}`,
    );
    expect(res.statusCode).toBe(500);

    const events = await reports.settle();
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event?.tags).toEqual({
      environment: REPORT_ENVIRONMENT,
      revision: REPORT_REVISION,
      trace_id: TRACE_ID,
      church_id: 'church_1',
    });
    expect(event?.environment).toBe(REPORT_ENVIRONMENT);
    expect(event?.release).toBe(REPORT_REVISION);
    expect(event?.user).toEqual({ id: 'user_1' });
    expect(event?.request).toEqual({
      method: 'POST',
      url: '/boom/crash/event_9',
      headers: expect.objectContaining({ 'user-agent': 'reporting-test' }),
    });

    const sent = reports.envelopes.join('\n');
    for (const secret of [
      EMAIL,
      NAME,
      IP,
      COOKIE_SECRET,
      BEARER_SECRET,
      BODY_SECRET,
      QUERY_SECRET,
      'authorization',
      'cookie',
    ]) {
      expect(sent).not.toContain(secret);
    }
  });

  it('reports a response-serialization error once', async () => {
    const res = await inject('GET', '/boom/serialization');
    expect(res.statusCode).toBe(500);
    const events = await reports.settle();
    expect(events).toHaveLength(1);
    expect(events[0]?.tags).toMatchObject({ trace_id: TRACE_ID });
  });

  it('never reports a DomainError', async () => {
    const res = await inject('GET', '/boom/domain');
    expect(res.statusCode).toBe(409);
    expect(await reports.settle()).toEqual([]);
  });

  it('never reports a database connection failure', async () => {
    const res = await inject('GET', '/boom/connection');
    expect(res.statusCode).toBe(503);
    expect(await reports.settle()).toEqual([]);
  });
});
