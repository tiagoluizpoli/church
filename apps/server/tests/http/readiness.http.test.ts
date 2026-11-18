import { db } from '@church/db';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { registerReadiness } from '@/main/fastify/readiness';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { testLocale } from '@/tests/test-support/fastify-locale';

const REVISION = 'a'.repeat(40);
// Nothing listens on the discard port, so every connection is refused.
const UNREACHABLE_DATABASE_URL =
  'postgresql://church:secret-password@127.0.0.1:9/church_staging';

let app: FastifyTypedInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

interface ReadyAppInput {
  checkDatabase: () => Promise<unknown>;
}

async function readyApp({ checkDatabase }: ReadyAppInput) {
  app = await createFastify({ locale: testLocale });
  registerReadiness({ app, revision: REVISION, checkDatabase });
  await app.ready();
  return app;
}

describe('GET /api/health', () => {
  it('reports the running revision once the database answers', async () => {
    const ready = await readyApp({
      checkDatabase: () => db.execute(sql`select 1`),
    });

    const response = await ready.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      database: 'ok',
      revision: REVISION,
    });
  });

  it('answers 503 with only safe metadata when the database is unreachable', async () => {
    const pool = new pg.Pool({ connectionString: UNREACHABLE_DATABASE_URL });
    const unreachable = drizzle(pool);
    try {
      const ready = await readyApp({
        checkDatabase: () => unreachable.execute(sql`select 1`),
      });

      const response = await ready.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        status: 'unavailable',
        database: 'unavailable',
        revision: REVISION,
      });
      expect(response.body).not.toContain('secret-password');
      expect(response.body).not.toContain('ECONNREFUSED');
    } finally {
      await pool.end();
    }
  });
});
