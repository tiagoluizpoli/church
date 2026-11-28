import fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schedulingTestPool } from '@/tests/scheduling-reshape/setup';
import {
  compareStatementCounts,
  countStatements,
} from '@/tests/test-support/statement-count';

const app = fastify();
let rowCount = 1;

beforeAll(async () => {
  app.get('/per-row', async () => {
    for (let row = 0; row < rowCount; row++) {
      await schedulingTestPool.query('select 1');
    }
    return { rowCount };
  });
  app.get('/fixed', async () => {
    await schedulingTestPool.query('select 1');
    return { rowCount };
  });
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe('countStatements', () => {
  it('counts only the statements of the one request, with its response', async () => {
    rowCount = 3;
    await schedulingTestPool.query('select 1');

    const request = { method: 'GET', url: '/per-row' } as const;
    const first = await countStatements({ app, request });
    const second = await countStatements({ app, request });

    expect(first.statements).toBe(3);
    expect(first.response.json()).toEqual({ rowCount: 3 });
    expect(second.statements).toBe(3);
  });
});

describe('compareStatementCounts', () => {
  it('counts each request on small data and again on grown data, leaving growth out', async () => {
    rowCount = 2;

    const { small, large } = await compareStatementCounts({
      app,
      requests: [
        { method: 'GET', url: '/per-row' },
        { method: 'GET', url: '/fixed' },
      ],
      grow: async () => {
        await schedulingTestPool.query('select 1');
        rowCount = 5;
      },
    });

    expect(small.map(({ statements }) => statements)).toEqual([2, 1]);
    expect(large.map(({ statements }) => statements)).toEqual([5, 1]);
    expect(small[0]?.response.json()).toEqual({ rowCount: 2 });
    expect(large[0]?.response.json()).toEqual({ rowCount: 5 });
  });
});
