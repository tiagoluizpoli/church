import { MinistryId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IMinistryManager } from '../../domain/contracts/application/ministry-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import { createChurchAdminHook } from '../auth/authority-access';
import type { FastifyController } from '../contracts/fastify-controller';
import { authErrorResponses } from '../dtos/error-response.dto';
import { ministryParamsSchema } from '../dtos/id.dto';
import { ministryMapper, ministryResponseSchema } from '../dtos/ministry.dto';
import { setDefaultDirectionBodySchema } from '../dtos/usual-setup.dto';
import type { MinistryAdminControllerDependencies } from './ministry-admin-controller.types';

/** Church-admin routes for Ministry settings kept under `/admin`. */
export class MinistryAdminController implements FastifyController {
  readonly prefix = '/admin';

  private readonly ministryManager: IMinistryManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: IAuthorityGuard;

  constructor({
    ministryManager,
    activeChurchResolver,
    authorityGuard,
  }: MinistryAdminControllerDependencies) {
    this.ministryManager = ministryManager;
    this.activeChurchResolver = activeChurchResolver;
    this.authorityGuard = authorityGuard;
  }

  // named-parameters-ignore: Fastify plugin signature (instance, opts); registered through app.register
  registerRoutes(
    app: FastifyTypedInstance,
    _opts: Record<string, unknown>,
  ): void {
    app.addHook(
      'preValidation',
      createActiveChurchPreValidation({ resolver: this.activeChurchResolver }),
    );

    app.addHook(
      'preValidation',
      createChurchAdminHook({ authorityGuard: this.authorityGuard }),
    );

    app.patch(
      '/ministries/:ministryId/default-direction',
      {
        schema: {
          params: ministryParamsSchema,
          tags: ['planning'],
          operationId: 'setMinistryDefaultDirection',
          summary: "Set a Ministry's default direction",
          description:
            "Set a Ministry's defaultDirection (all_in or all_out) for source-linked EventTimeBlocks with no UsualSetup entry at Send: all_out (the default) excludes them, all_in includes them with one whole-block Shift and no requirements. An explicit UsualSetup entry always wins, and source-less blocks are never auto-included.",
          body: setDefaultDirectionBodySchema,
          response: { 200: ministryResponseSchema, ...authErrorResponses },
        },
      },
      async (request, reply) => {
        const { ministryId } = request.params;
        const body = request.body;
        const ministry = await this.ministryManager.setDefaultDirection({
          churchId: request.churchId,
          ministryId: MinistryId.from(ministryId),
          defaultDirection: body.defaultDirection,
        });
        return reply.send(ministryMapper.toResponse(ministry));
      },
    );
  }
}
