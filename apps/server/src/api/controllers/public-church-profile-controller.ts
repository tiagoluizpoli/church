import type { AppConfig } from '@church/app-config';
import type { z } from 'zod';
import type { IPublicChurchProfileManager } from '../../domain/contracts/application/public-church-profile-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  publicChurchProfileErrorResponseSchema,
  publicChurchProfileParamsSchema,
  publicChurchProfileResponseSchema,
} from '../dtos/public-church-profile.dto';
import { isRateLimited } from '../utils/rate-limit';
import { refuse } from '../utils/refuse';

type PublicChurchProfileParams = z.infer<
  typeof publicChurchProfileParamsSchema
>;

interface PublicChurchProfileControllerDependencies {
  publicChurchProfileManager: IPublicChurchProfileManager;
  config: AppConfig;
}

/** Sign-in-free reads of the Public Church Profile, rate limited per client IP. */
export class PublicChurchProfileController implements FastifyController {
  readonly prefix = '/public/churches';

  private readonly publicChurchProfileManager: IPublicChurchProfileManager;
  private readonly rateLimit: AppConfig['publicProfileRateLimit'];

  constructor({
    publicChurchProfileManager,
    config,
  }: PublicChurchProfileControllerDependencies) {
    this.publicChurchProfileManager = publicChurchProfileManager;
    const { publicProfileRateLimit } = config;
    this.rateLimit = publicProfileRateLimit;
  }

  // named-parameters-ignore: Fastify plugin signature (instance, opts); registered through app.register
  registerRoutes(
    app: FastifyTypedInstance,
    _opts: Record<string, unknown>,
  ): void {
    app.get(
      '/:slug',
      {
        schema: {
          tags: ['public-church-profile'],
          operationId: 'getPublicChurchProfile',
          summary: 'Get a Public Church Profile',
          description:
            'The public identity of the Church a live or old Church Slug names. No session needed. `slug` is always the current one: an old slug answers the current slug so the caller replaces its URL. Unknown slug: 404.',
          params: publicChurchProfileParamsSchema,
          response: {
            200: publicChurchProfileResponseSchema,
            404: publicChurchProfileErrorResponseSchema,
            429: publicChurchProfileErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { windowMs, maxRequests } = this.rateLimit;
        if (
          isRateLimited({
            key: `public-church-profile:${request.ip}`,
            windowMs,
            maxRequests,
          })
        )
          return refuse({ reply, request, code: 'RATE_LIMITED' });
        const { slug } = request.params as PublicChurchProfileParams;
        const profile = await this.publicChurchProfileManager.getProfile({
          slug,
        });
        if (!profile) return refuse({ reply, request, code: 'NOT_FOUND' });
        return reply.send(profile);
      },
    );
  }
}
