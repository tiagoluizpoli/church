import 'reflect-metadata';
import { auth } from '@church/auth';
import { inject, injectable } from 'tsyringe';
import type { IFeatureFlagManager } from '../../domain/contracts/application/feature-flag-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import type { FastifyController } from '../contracts/fastify-controller';
import { featureFlagsResponseSchema } from '../dtos/feature-flags.dto';

@injectable()
export class FeatureFlagController implements FastifyController {
  readonly prefix = '/feature-flags';

  constructor(
    @inject('IFeatureFlagManager')
    private readonly featureFlagManager: IFeatureFlagManager,
  ) {}

  registerRoutes(
    app: FastifyTypedInstance,
    _opts: Record<string, unknown>,
  ): void {
    app.get(
      '/',
      { schema: { response: { 200: featureFlagsResponseSchema } } },
      async (request, reply) => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(request.headers)) {
          if (value)
            headers.set(key, Array.isArray(value) ? (value[0] ?? '') : value);
        }

        const session = await auth.api
          .getSession({ headers })
          .catch(() => null);

        const ctx: { userId?: string; churchId?: string } = {};
        if (session?.user) {
          ctx.userId = session.user.id;
        }

        const flags = await this.featureFlagManager.getAll(ctx);
        return reply.send({ flags });
      },
    );
  }
}
