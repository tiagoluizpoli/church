import type { FastifyInstance } from 'fastify';

export interface RegisterE2eTargetHeaderInput {
  app: FastifyInstance;
  /** `debugEndpointsEnabled()`: production never exposes its target. */
  enabled: boolean;
}
