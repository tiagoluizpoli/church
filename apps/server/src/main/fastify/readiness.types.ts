import type { FastifyInstance } from 'fastify';

export interface RegisterReadinessInput {
  app: FastifyInstance;
  /** The source revision this process runs, compared by deployment checks. */
  revision: string;
  /** Resolves only when the application database answers a query. */
  checkDatabase: () => Promise<unknown>;
}

export type ReadinessStatus = 'ok' | 'unavailable';

export interface ReadinessBody {
  status: ReadinessStatus;
  database: ReadinessStatus;
  revision: string;
}
