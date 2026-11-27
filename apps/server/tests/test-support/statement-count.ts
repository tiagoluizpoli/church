import type { FastifyInstance, InjectOptions } from 'fastify';
import pg from 'pg';
import { vi } from 'vitest';

export interface CountStatementsInput {
  app: Pick<FastifyInstance, 'inject'>;
  request: InjectOptions;
}

/**
 * Runs one HTTP request and counts the SQL statements the pg driver ran for it,
 * transaction control included. Storage and authorization stay real.
 */
export async function countStatements({ app, request }: CountStatementsInput) {
  const queries = vi.spyOn(pg.Client.prototype, 'query');
  try {
    const response = await app.inject(request);
    return { response, statements: queries.mock.calls.length };
  } finally {
    queries.mockRestore();
  }
}

export interface CompareStatementCountsInput {
  app: Pick<FastifyInstance, 'inject'>;
  requests: readonly InjectOptions[];
  /** Adds data between the two runs; its statements are not counted. */
  grow: () => Promise<void>;
}

/**
 * Counts every request on the data as seeded (`small`), grows the data, then
 * counts them again (`large`). Both lists follow the order of `requests`.
 */
export async function compareStatementCounts({
  app,
  requests,
  grow,
}: CompareStatementCountsInput) {
  const countEach = async () => {
    const counted: Awaited<ReturnType<typeof countStatements>>[] = [];
    // One at a time: concurrent requests would share one spy.
    for (const request of requests) {
      const result = await countStatements({ app, request });
      counted.push(result);
    }
    return counted;
  };
  const small = await countEach();
  await grow();
  const large = await countEach();
  return { small, large };
}
