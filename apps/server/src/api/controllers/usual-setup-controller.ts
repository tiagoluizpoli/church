import { z } from 'zod';
import { MinistryId, TemplateTimeBlockId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IMinistryManager } from '../../domain/contracts/application/ministry-manager';
import type { IUsualSetupManager } from '../../domain/contracts/application/usual-setup-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import { resolveManagedMinistry } from '../auth/authority-access';
import type { FastifyController } from '../contracts/fastify-controller';
import { ministryParamsSchema } from '../dtos/id.dto';
import {
  usualSetupBlockListResponseSchema,
  usualSetupBlockParamsSchema,
  usualSetupBlockResponseSchema,
  usualSetupEntryBodySchema,
  usualSetupMapper,
} from '../dtos/usual-setup.dto';
import type { UsualSetupControllerDependencies } from './usual-setup-controller.types';

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

/** A Ministry's Usual setup, for ChurchAdmins and the Ministry's own leaders. */
export class UsualSetupController implements FastifyController {
  readonly prefix = '/ministries/:ministryId/usual-setup';

  private readonly ministryManager: IMinistryManager;
  private readonly usualSetupManager: IUsualSetupManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: IAuthorityGuard;

  constructor({
    ministryManager,
    usualSetupManager,
    activeChurchResolver,
    authorityGuard,
  }: UsualSetupControllerDependencies) {
    this.ministryManager = ministryManager;
    this.usualSetupManager = usualSetupManager;
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
      createActiveChurchPreValidation({
        resolver: this.activeChurchResolver,
      }),
    );

    app.get(
      '/',
      {
        schema: {
          tags: ['ministries'],
          operationId: 'listUsualSetup',
          params: ministryParamsSchema,
          summary: "List a Ministry's Usual setup",
          description:
            "Every current TemplateTimeBlock, by template name and block order, with the managed Ministry's saved UsualSetup entry when it has one.",
          response: {
            200: usualSetupBlockListResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const ministryId = await resolveManagedMinistry({
          authorityGuard: this.authorityGuard,
          ministryManager: this.ministryManager,
          request,
          reply,
          ministryId: MinistryId.from(request.params.ministryId),
        });
        if (!ministryId) return;
        const blocks = await this.usualSetupManager.listUsualSetupBlocks({
          churchId: request.churchId,
          ministryId,
        });
        return reply.send(usualSetupMapper.toBlockListResponse(blocks));
      },
    );

    app.put(
      '/:sourceTemplateTimeBlockId',
      {
        schema: {
          tags: ['ministries'],
          operationId: 'saveUsualSetupBlock',
          params: usualSetupBlockParamsSchema,
          summary: "Save one block's Usual setup",
          description:
            "Insert or replace the managed Ministry's UsualSetup entry for one TemplateTimeBlock: whether it serves, its Shift split and per-Shift headcounts. Other blocks' entries are untouched.",
          body: usualSetupEntryBodySchema,
          response: {
            200: usualSetupBlockResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const ministryId = await resolveManagedMinistry({
          authorityGuard: this.authorityGuard,
          ministryManager: this.ministryManager,
          request,
          reply,
          ministryId: MinistryId.from(request.params.ministryId),
        });
        if (!ministryId) return;
        const { sourceTemplateTimeBlockId } = request.params;
        const block = await this.usualSetupManager.saveUsualSetupBlock({
          churchId: request.churchId,
          ministryId,
          entry: usualSetupMapper.toEntryInput({
            sourceTemplateTimeBlockId: TemplateTimeBlockId.from(
              sourceTemplateTimeBlockId,
            ),
            body: request.body,
          }),
        });
        return reply.send(usualSetupMapper.toBlockResponse(block));
      },
    );
  }
}
