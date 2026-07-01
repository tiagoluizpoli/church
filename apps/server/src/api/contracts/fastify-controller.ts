import type { FastifyTypedInstance } from '@/main/fastify/types';

export abstract class FastifyController {
  abstract readonly prefix: string;
  abstract registerRoutes(
    app: FastifyTypedInstance,
    opts: Record<string, unknown>,
  ): void;
}
