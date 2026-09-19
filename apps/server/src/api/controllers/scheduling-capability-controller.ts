import 'reflect-metadata';
import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import { ChurchId, UserId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { AuthorityGuard } from '../auth/authority-guard';
import type { FastifyController } from '../contracts/fastify-controller';

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

const schedulingCapabilityResponseSchema = z.object({
  canAccessScheduling: z.boolean(),
});

/**
 * Resolves navigation capability for the Active Church. This response never
 * authorizes resource access; protected routes continue through AuthorityService.
 */
@injectable()
export class SchedulingCapabilityController implements FastifyController {
  readonly prefix = '/scheduling';

  constructor(
    @inject('IActiveChurchResolver')
    private readonly activeChurchResolver: IActiveChurchResolver,
    @inject('AuthorityGuard')
    private readonly authorityGuard: AuthorityGuard,
  ) {}

  registerRoutes(
    app: FastifyTypedInstance,
    _opts: Record<string, unknown>,
  ): void {
    app.addHook(
      'preValidation',
      createActiveChurchPreValidation({ resolver: this.activeChurchResolver }),
    );

    app.get(
      '/capability',
      {
        schema: {
          tags: ['scheduling-capability'],
          operationId: 'getSchedulingCapability',
          summary: 'Get Scheduling capability for the Active Church',
          description:
            'Return whether the current caller may enter Scheduling in the Active Church. This is navigation data, not an authorization grant.',
          response: {
            200: schedulingCapabilityResponseSchema,
            401: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const capability =
          await this.authorityGuard.resolveSchedulingCapability({
            churchId: ChurchId.from(request.churchId),
            userId: UserId.from(request.userId),
          });
        return reply.send(capability);
      },
    );
  }
}
