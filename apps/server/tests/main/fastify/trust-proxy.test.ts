import { env } from '@church/env/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';

const CLIENT_IP = '203.0.113.7';
const SPOOFED_IP = '198.51.100.66';
const PROXY_IP = '10.0.0.2';

/** Deployed: Dokploy's proxy → Caddy → server, so TRUST_PROXY_HOPS hops are trusted and no more. */
describe('client address behind the configured proxies', () => {
  let app: FastifyTypedInstance;

  beforeAll(async () => {
    app = await createFastify({
      locale: testLocale,
      errorReporter: testErrorReporter,
    });
    app.get('/ip', async (request) => ({ ip: request.ip }));
    await app.ready();
  });

  afterAll(() => app.close());

  it('reads the client from X-Forwarded-For and ignores hops added before it', async () => {
    const trustedProxies = Array.from(
      { length: env.TRUST_PROXY_HOPS - 1 },
      () => PROXY_IP,
    );
    const forwardedFor = [SPOOFED_IP, CLIENT_IP, ...trustedProxies].join(', ');

    const response = await app.inject({
      method: 'GET',
      url: '/ip',
      remoteAddress: PROXY_IP,
      headers: { 'x-forwarded-for': forwardedFor },
    });

    expect(response.json()).toEqual({ ip: CLIENT_IP });
  });

  it('uses the socket address when no proxy forwarded the request', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/ip',
      remoteAddress: CLIENT_IP,
    });

    expect(response.json()).toEqual({ ip: CLIENT_IP });
  });
});
