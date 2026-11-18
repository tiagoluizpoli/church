// biome-ignore-all lint/style/useNamingConvention: Sentry envelope fields are snake_case on the wire

import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { appConfig } from '@church/app-config';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerErrorReportTunnel } from '@/main/fastify/error-report-tunnel';
import { createFastify, DESKTOP_ORIGIN } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';

const ERROR_REPORT_TUNNEL_PATH = appConfig.errorReportTunnel.path;
const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const EMAIL = 'ana.member@example.test';
const IP = '203.0.113.9';
const MAX_REQUESTS = 3;
// Far longer than any answer may take: the browser is never held by the tracker.
const FORWARD_TIMEOUT_MS = 5000;
const FAST_ANSWER_MS = 1000;

interface ReceivedReport {
  url: string;
  body: string;
}

interface FakeTracker {
  server: Server;
  dsn: string;
  received: ReceivedReport[];
}

type TrackerHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => void;

interface StartTrackerInput {
  handler: TrackerHandler;
}

async function startTracker({
  handler,
}: StartTrackerInput): Promise<FakeTracker> {
  const received: ReceivedReport[] = [];
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      received.push({ url: request.url ?? '', body });
      handler(request, response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, dsn: `http://public@127.0.0.1:${port}/1`, received };
}

async function stopTracker(tracker: FakeTracker): Promise<void> {
  tracker.server.closeAllConnections();
  await new Promise((resolve) => tracker.server.close(resolve));
}

interface TunnelAppInput {
  dsn: string | undefined;
}

async function tunnelApp({
  dsn,
}: TunnelAppInput): Promise<FastifyTypedInstance> {
  const app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  registerErrorReportTunnel({
    app,
    dsn,
    environment: 'staging',
    settings: {
      path: ERROR_REPORT_TUNNEL_PATH,
      windowMs: 60_000,
      maxRequests: MAX_REQUESTS,
      forwardTimeoutMs: FORWARD_TIMEOUT_MS,
    },
  });
  await app.ready();
  return app;
}

const errorEvent = {
  event_id: 'a'.repeat(32),
  level: 'error',
  platform: 'javascript',
  environment: 'staging',
  release: 'rev-test',
  tags: { environment: 'staging', revision: 'rev-test', email: EMAIL },
  user: { id: 'user_1', email: EMAIL, ip_address: IP },
  request: {
    url: `https://church.test/redemption/church/inv_secret?email=${EMAIL}`,
    headers: { 'User-Agent': 'browser-test', Cookie: 'session=secret' },
  },
  breadcrumbs: [{ message: `clicked ${EMAIL}` }],
  exception: {
    values: [
      {
        type: 'TypeError',
        value: `cannot read ${EMAIL}`,
        mechanism: { type: 'onunhandledrejection', handled: false },
        stacktrace: { frames: [{ filename: 'app.js', lineno: 1, colno: 2 }] },
      },
    ],
  },
  contexts: { trace: { trace_id: TRACE_ID, span_id: '00f067aa0ba902b7' } },
};

interface EnvelopeInput {
  dsn: string;
  itemType?: string;
  payload?: Record<string, unknown>;
}

function envelope({
  dsn,
  itemType = 'event',
  payload = errorEvent,
}: EnvelopeInput): string {
  return [
    JSON.stringify({
      event_id: 'a'.repeat(32),
      sent_at: '2026-11-18T12:00:00.000Z',
      dsn,
      trace: {
        trace_id: TRACE_ID,
        public_key: 'public',
        transaction: `/people/${EMAIL}`,
      },
    }),
    JSON.stringify({ type: itemType }),
    JSON.stringify(payload),
  ].join('\n');
}

interface PostInput {
  app: FastifyTypedInstance;
  body: string;
  remoteAddress: string;
  origin?: string;
}

const post = ({ app, body, remoteAddress, origin }: PostInput) =>
  app.inject({
    method: 'POST',
    url: ERROR_REPORT_TUNNEL_PATH,
    remoteAddress,
    headers: {
      'content-type': 'text/plain;charset=UTF-8',
      ...(origin && { origin }),
    },
    payload: body,
  });

async function waitForReport(tracker: FakeTracker): Promise<ReceivedReport> {
  await expect.poll(() => tracker.received.length).toBe(1);
  return tracker.received[0] as ReceivedReport;
}

describe(`POST ${ERROR_REPORT_TUNNEL_PATH}`, () => {
  let tracker: FakeTracker;
  let app: FastifyTypedInstance;

  beforeAll(async () => {
    tracker = await startTracker({
      handler: (_request, response) => response.writeHead(200).end('{}'),
    });
    app = await tunnelApp({ dsn: tracker.dsn });
  });

  afterAll(async () => {
    await app.close();
    await stopTracker(tracker);
  });

  beforeEach(() => {
    tracker.received.length = 0;
  });

  it('scrubs a valid error event and forwards it to the tracker', async () => {
    const response = await post({
      app,
      body: envelope({ dsn: tracker.dsn }),
      remoteAddress: '198.51.100.1',
    });

    expect(response.statusCode).toBe(202);
    const report = await waitForReport(tracker);
    expect(report.url).toBe('/api/1/envelope/?sentry_key=public');
    const [header, itemHeader, payload, ...rest] = report.body.split('\n');
    expect(rest).toEqual([]);
    expect(JSON.parse(header ?? '')).toEqual({
      event_id: 'a'.repeat(32),
      sent_at: '2026-11-18T12:00:00.000Z',
      dsn: tracker.dsn,
    });
    expect(JSON.parse(itemHeader ?? '')).toEqual({ type: 'event' });
    expect(JSON.parse(payload ?? '')).toEqual({
      event_id: 'a'.repeat(32),
      level: 'error',
      platform: 'javascript',
      environment: 'staging',
      release: 'rev-test',
      tags: { environment: 'staging', revision: 'rev-test' },
      user: { id: 'user_1' },
      request: {
        url: 'https://church.test/redemption/church/:redacted',
        headers: { 'User-Agent': 'browser-test' },
      },
      exception: {
        values: [
          {
            type: 'TypeError',
            mechanism: { type: 'onunhandledrejection', handled: false },
            stacktrace: {
              frames: [{ filename: 'app.js', lineno: 1, colno: 2 }],
            },
          },
        ],
      },
      contexts: { trace: { trace_id: TRACE_ID, span_id: '00f067aa0ba902b7' } },
    });
    expect(report.body).not.toContain(EMAIL);
    expect(report.body).not.toContain(IP);
    expect(report.body).not.toContain('inv_secret');
  });

  it('tells the web app where and as which environment to report', async () => {
    const response = await app.inject({
      method: 'GET',
      url: ERROR_REPORT_TUNNEL_PATH,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      dsn: tracker.dsn,
      environment: 'staging',
    });
  });

  it('refuses an envelope for a foreign DSN and forwards nothing', async () => {
    const response = await post({
      app,
      body: envelope({ dsn: 'http://public@tracker.elsewhere.test/1' }),
      remoteAddress: '198.51.100.2',
    });

    expect(response.statusCode).toBe(403);
    expect(tracker.received).toEqual([]);
  });

  it.each([
    [
      'a transaction',
      '192.0.2.1',
      {
        itemType: 'transaction',
        payload: { type: 'transaction', ...errorEvent },
      },
    ],
    ['a replay', '192.0.2.2', { itemType: 'replay_event' }],
    [
      'a session',
      '192.0.2.3',
      { itemType: 'session', payload: { sid: 'x', status: 'ok' } },
    ],
    [
      'an attachment',
      '192.0.2.4',
      { itemType: 'attachment', payload: { data: 'x' } },
    ],
    [
      'a message event without an error',
      '192.0.2.5',
      { payload: { ...errorEvent, exception: undefined } },
    ],
  ])('refuses %s and forwards nothing', async (_name, remoteAddress, item) => {
    const response = await post({
      app,
      body: envelope({ dsn: tracker.dsn, ...item }),
      remoteAddress,
    });

    expect(response.statusCode).toBe(400);
    expect(tracker.received).toEqual([]);
  });

  it('refuses a body that is not an envelope', async () => {
    const response = await post({
      app,
      body: 'not an envelope',
      remoteAddress: '198.51.100.4',
    });

    expect(response.statusCode).toBe(400);
    expect(tracker.received).toEqual([]);
  });

  it('refuses a burst over the limit and forwards only the allowed reports', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt <= MAX_REQUESTS; attempt += 1) {
      const response = await post({
        app,
        body: envelope({ dsn: tracker.dsn }),
        remoteAddress: '198.51.100.5',
      });
      statuses.push(response.statusCode);
    }

    expect(statuses).toEqual([202, 202, 202, 429]);
    await expect.poll(() => tracker.received.length).toBe(MAX_REQUESTS);
  });

  it('accepts a report from the desktop app origin', async () => {
    const response = await post({
      app,
      body: envelope({ dsn: tracker.dsn }),
      remoteAddress: '198.51.100.6',
      origin: DESKTOP_ORIGIN,
    });

    expect(response.statusCode).toBe(202);
    expect(response.headers['access-control-allow-origin']).toBe(
      DESKTOP_ORIGIN,
    );
    await waitForReport(tracker);
  });
});

describe('an unreachable tracker', () => {
  let tracker: FakeTracker;
  let app: FastifyTypedInstance;

  beforeAll(async () => {
    // Takes the connection and never answers.
    tracker = await startTracker({ handler: () => {} });
    app = await tunnelApp({ dsn: tracker.dsn });
  });

  afterAll(async () => {
    await app.close();
    await stopTracker(tracker);
  });

  it('still gets a fast answer from the endpoint', async () => {
    const startedAt = performance.now();
    const response = await post({
      app,
      body: envelope({ dsn: tracker.dsn }),
      remoteAddress: '198.51.100.7',
    });
    const elapsedMs = performance.now() - startedAt;

    expect(response.statusCode).toBe(202);
    expect(elapsedMs).toBeLessThan(FAST_ANSWER_MS);
    await waitForReport(tracker);
  });
});

describe('with error reporting off', () => {
  let app: FastifyTypedInstance;

  beforeAll(async () => {
    app = await tunnelApp({ dsn: undefined });
  });

  afterAll(async () => app.close());

  it('answers 204 and forwards nothing', async () => {
    const response = await post({
      app,
      body: envelope({ dsn: 'http://public@127.0.0.1:9/1' }),
      remoteAddress: '198.51.100.8',
    });

    expect(response.statusCode).toBe(204);
  });

  it('tells the web app not to report', async () => {
    const response = await app.inject({
      method: 'GET',
      url: ERROR_REPORT_TUNNEL_PATH,
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
  });
});
