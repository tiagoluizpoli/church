import { db } from '@church/db';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { testDb } from './setup';

interface TimeoutRow extends Record<string, unknown> {
  lock: string;
  statement: string;
}

// A stalled integration test must fail with a named wait (connect, lock or
// statement) before Vitest's anonymous 30s timeout.
describe.each([
  { name: 'app database', database: db },
  { name: 'test database', database: testDb },
])('$name pool limits', ({ database }) => {
  it('times out a connect, a lock wait and a statement before the 30s test budget', async () => {
    const { rows } = await database.execute<TimeoutRow>(sql`
      select current_setting('lock_timeout') as lock,
        current_setting('statement_timeout') as statement`);
    const pool = database.$client as pg.Pool;

    expect(rows).toEqual([{ lock: '15s', statement: '25s' }]);
    expect(pool.options.connectionTimeoutMillis).toBe(20_000);
  });
});
