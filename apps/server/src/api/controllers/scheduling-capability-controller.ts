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

const callerCapabilitiesResponseSchema = z.object({
  churchId: z.uuid(),
  isChurchAdmin: z.boolean(),
  ledMinistries: z.array(z.object({ ministryId: z.uuid(), name: z.string() })),
  hasVolunteerMembership: z.boolean(),
});

/**
 * Resolves navigation capability for the Active Church. This response never
 * authorizes resource access; protected routes continue through AuthorityService.
 */
interface CallerCapabilitiesControllerDependencies {
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: AuthorityGuard;
}

export class CallerCapabilitiesController implements FastifyController {
  readonly prefix = '';

  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: AuthorityGuard;

  constructor({
    activeChurchResolver,
    authorityGuard,
  }: CallerCapabilitiesControllerDependencies) {
    this.activeChurchResolver = activeChurchResolver;
    this.authorityGuard = authorityGuard;
  }

  registerRoutes(
    app: FastifyTypedInstance,
    _opts: Record<string, unknown>,
  ): void {
    app.addHook(
      'preValidation',
      createActiveChurchPreValidation({ resolver: this.activeChurchResolver }),
    );

    app.get(
      '/caller-capabilities',
      {
        schema: {
          tags: ['caller-capabilities'],
          operationId: 'getCallerCapabilities',
          summary: 'Get caller capabilities for the Active Church',
          description:
            'Return the current caller capacities in the Active Church. This is navigation data, not an authorization grant.',
          response: {
            200: callerCapabilitiesResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const capabilities =
          await this.authorityGuard.resolveCallerCapabilities({
            churchId: ChurchId.from(request.churchId),
            userId: UserId.from(request.userId),
          });
        return reply.send(capabilities);
      },
    );
  }
}
