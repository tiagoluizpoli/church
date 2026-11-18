import type { FastifyTypedInstance } from '@/main/fastify/types';

export abstract class FastifyController {
  abstract readonly prefix: string;
  // named-parameters-ignore: Fastify plugin signature (instance, opts); registered through app.register
  abstract registerRoutes(
    app: FastifyTypedInstance,
    opts: Record<string, unknown>,
  ): void;
}
