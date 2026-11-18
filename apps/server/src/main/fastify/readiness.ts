import type { FastifyInstance } from 'fastify';

export const READINESS_PATH = '/api/health';
const SERVICE_UNAVAILABLE = 503;

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

/**
 * Unauthenticated readiness on the API's own `/api` prefix, so it is reached
 * through the deployed same-origin routing. It reports only status and
 * revision: a database failure answers 503 without its cause, which the
 * server log keeps.
 */
export function registerReadiness({
  app,
  revision,
  checkDatabase,
}: RegisterReadinessInput): void {
  app.get(READINESS_PATH, async (request, reply) => {
    try {
      await checkDatabase();
    } catch (error) {
      request.log.error({ err: error }, 'Readiness database check failed');
      const body: ReadinessBody = {
        status: 'unavailable',
        database: 'unavailable',
        revision,
      };
      return reply.code(SERVICE_UNAVAILABLE).send(body);
    }
    const body: ReadinessBody = { status: 'ok', database: 'ok', revision };
    return body;
  });
}
