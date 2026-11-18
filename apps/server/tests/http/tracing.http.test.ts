import { type ChildProcess, spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { outboxMessage } from '@church/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildChurch } from '@/seeds/builders/church';
import { testDb, truncateAll } from '@/tests/integration/repositories/setup';

// The span smoke test: the real server under Bun with the production preload,
// exporting OTLP to an in-memory receiver here. It guards against a Bun or
// SDK upgrade silently switching tracing off (ADR 0015).

const SECRET_EMAIL = 'span-smoke-secret@example.test';
const SPAN_WAIT_MS = 15_000;
const POLL_MS = 100;
const OUTBOX_POLL_MS = '1000';

interface OtlpAttribute {
  key: string;
  value: Record<string, unknown>;
}

interface ExportedSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  attributes: OtlpAttribute[];
}

interface OtlpRequest {
  resourceSpans: { scopeSpans: { spans: ExportedSpan[] }[] }[];
}

const spans: ExportedSpan[] = [];
let receiver: Server;
let server: ChildProcess;
let baseUrl: string;
let serverOutput = '';

const listen = async (target: Server): Promise<number> => {
  await new Promise<void>((done) => target.listen(0, '127.0.0.1', done));
  return (target.address() as AddressInfo).port;
};

const freePort = async (): Promise<number> => {
  const probe = createServer();
  const port = await listen(probe);
  probe.close();
  return port;
};

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function waitFor<T>(find: () => T | undefined): Promise<T> {
  const deadline = Date.now() + SPAN_WAIT_MS;
  while (Date.now() < deadline) {
    const found = find();
    if (found !== undefined) return found;
    await sleep(POLL_MS);
  }
  throw new Error(`Timed out. Spans: ${spans.map((s) => s.name).join(', ')}
Server output: ${serverOutput}`);
}

const attribute = (span: ExportedSpan, key: string) =>
  span.attributes.find((a) => a.key === key)?.value.stringValue;

/** Is `span` nested (at any depth) under `ancestor`? */
function isUnder(span: ExportedSpan, ancestor: ExportedSpan): boolean {
  let parentId = span.parentSpanId;
  while (parentId) {
    if (parentId === ancestor.spanId) return true;
    parentId = spans.find((s) => s.spanId === parentId)?.parentSpanId;
  }
  return false;
}

const pgSpansUnder = (parent: ExportedSpan) =>
  spans.filter((s) => attribute(s, 'db.query.text') && isUnder(s, parent));

beforeAll(async () => {
  await truncateAll();
  const church = await buildChurch({
    db: testDb,
    id: crypto.randomUUID(),
    name: 'Span Smoke',
    slug: 'span-smoke',
    timezone: 'America/Sao_Paulo',
  });
  // A due row the poller delivers (it fails terminally: the payload is empty).
  await testDb.insert(outboxMessage).values({
    churchId: church.id,
    kind: 'notification',
    payload: {},
    scheduledFor: new Date(0),
    correlationId: 'span-smoke',
  });

  receiver = createServer(async (req, res) => {
    if (req.url !== '/v1/traces') return res.writeHead(404).end();
    let body = '';
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body) as OtlpRequest;
    for (const resource of request.resourceSpans)
      for (const scope of resource.scopeSpans) spans.push(...scope.spans);
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
  });
  const receiverPort = await listen(receiver);
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;

  server = spawn(
    'bun',
    ['--preload', './src/main/instrumentation.ts', 'src/main/server.ts'],
    {
      cwd: `${import.meta.dirname}/../..`,
      env: {
        ...process.env,
        PORT: String(port),
        OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${receiverPort}`,
        OTEL_BSP_SCHEDULE_DELAY: String(POLL_MS),
        OUTBOX_POLL_INTERVAL_MS: OUTBOX_POLL_MS,
      },
    },
  );
  server.stdout?.on('data', (chunk) => {
    serverOutput += chunk;
  });
  server.stderr?.on('data', (chunk) => {
    serverOutput += chunk;
  });

  const deadline = Date.now() + SPAN_WAIT_MS;
  for (;;) {
    const ready = await fetch(`${baseUrl}/api/health`).then(
      (res) => res.ok,
      () => false,
    );
    if (ready) break;
    if (Date.now() > deadline)
      throw new Error(`Server never became ready: ${serverOutput}`);
    await sleep(POLL_MS);
  }
});

afterAll(async () => {
  server?.kill();
  receiver?.close();
  await truncateAll();
});

const signIn = (headers: Record<string, string>) =>
  fetch(`${baseUrl}/api/auth/sign-in/email?email=${SECRET_EMAIL}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ email: SECRET_EMAIL, password: 'not-the-password' }),
  });

describe('server traces', () => {
  it.each([
    ['no traceparent', {}],
    [
      'a traceparent the request id rejects',
      {
        traceparent: '01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      },
    ],
  ])('exports a request span with its SQL nested under it, for %s', async (_case, headers) => {
    const res = await signIn(headers);
    const requestId = res.headers.get('x-request-id');

    const request = await waitFor(() =>
      spans.find((s) => s.name === 'request' && s.traceId === requestId),
    );
    const queries = await waitFor(() => {
      const found = pgSpansUnder(request);
      return found.length > 0 ? found : undefined;
    });

    expect(request.parentSpanId ?? '').toBe('');
    expect(attribute(request, 'url.path')).toBe('/api/auth/sign-in/email');
    const [query] = queries;
    expect(query && attribute(query, 'db.query.text')).toMatch(/select/i);
    const exported = JSON.stringify(
      spans.filter((s) => s.traceId === requestId),
    );
    expect(exported).not.toContain(SECRET_EMAIL);
    // ADR 0014: no client address, user agent, query string or bound values.
    const keys = spans
      .filter((s) => s.traceId === requestId)
      .flatMap((s) => s.attributes.map((a) => a.key));
    for (const forbidden of [
      'client.address',
      'network.peer.address',
      'net.peer.ip',
      'http.client_ip',
      'user_agent.original',
      'http.user_agent',
      'url.full',
      'url.query',
      'http.target',
      'http.url',
      'db.postgresql.values',
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('honours a valid incoming traceparent', async () => {
    const traceId = 'a'.repeat(32);
    const parentId = 'b'.repeat(16);
    const res = await signIn({ traceparent: `00-${traceId}-${parentId}-01` });

    expect(res.headers.get('x-request-id')).toBe(traceId);
    const request = await waitFor(() =>
      spans.find((s) => s.name === 'request' && s.traceId === traceId),
    );
    expect(request.parentSpanId).toBe(parentId);
  });

  it('nests outbox SQL under one span per poller tick and per delivery', async () => {
    const delivery = await waitFor(() =>
      spans.find((s) => s.name === 'outbox.delivery'),
    );
    const tick = spans.find((s) => s.spanId === delivery.parentSpanId);

    if (!tick) throw new Error('the delivery span has no parent');
    const deliverySql = pgSpansUnder(delivery).length;

    expect(tick.name).toBe('outbox.tick');
    expect(deliverySql).toBeGreaterThan(0);
    // The tick's own claim query plus the delivery's.
    expect(pgSpansUnder(tick).length).toBeGreaterThan(deliverySql);
  });
});
