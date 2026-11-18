import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  ChurchId,
  MinistryId,
  TemplateTimeBlockId,
} from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IMinistryManager } from '../../domain/contracts/application/ministry-manager';
import type { IParticipationManager } from '../../domain/contracts/application/participation-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { AuthorityGuard } from '../auth/authority-guard';
import { denyMinistryManagement } from '../auth/ministry-management-access';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  type UsualSetupEntryBody,
  usualSetupBlockListResponseSchema,
  usualSetupBlockResponseSchema,
  usualSetupEntryBodySchema,
  usualSetupMapper,
} from '../dtos/usual-setup.dto';

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

interface UsualSetupRouteParams {
  ministryId: string;
}

interface UsualSetupBlockRouteParams extends UsualSetupRouteParams {
  sourceTemplateTimeBlockId: string;
}

interface ResolveManagedMinistryInput {
  request: FastifyRequest;
  reply: FastifyReply;
}

interface UsualSetupControllerDependencies {
  ministryManager: IMinistryManager;
  participationManager: IParticipationManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: AuthorityGuard;
}

/** A Ministry's Usual setup, for ChurchAdmins and the Ministry's own leaders. */
export class UsualSetupController implements FastifyController {
  readonly prefix = '/ministries/:ministryId/usual-setup';

  private readonly ministryManager: IMinistryManager;
  private readonly participationManager: IParticipationManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: AuthorityGuard;

  constructor({
    ministryManager,
    participationManager,
    activeChurchResolver,
    authorityGuard,
  }: UsualSetupControllerDependencies) {
    this.ministryManager = ministryManager;
    this.participationManager = participationManager;
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
        const ministryId = await this.resolveManagedMinistry({
          request,
          reply,
        });
        if (!ministryId) return;
        const blocks = await this.participationManager.listUsualSetupBlocks({
          churchId: ChurchId.from(request.churchId),
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
        const ministryId = await this.resolveManagedMinistry({
          request,
          reply,
        });
        if (!ministryId) return;
        const { sourceTemplateTimeBlockId } =
          request.params as UsualSetupBlockRouteParams;
        const block = await this.participationManager.saveUsualSetupBlock({
          churchId: ChurchId.from(request.churchId),
          ministryId,
          entry: usualSetupMapper.toEntryInput({
            sourceTemplateTimeBlockId: TemplateTimeBlockId.from(
              sourceTemplateTimeBlockId,
            ),
            body: request.body as UsualSetupEntryBody,
          }),
        });
        return reply.send(usualSetupMapper.toBlockResponse(block));
      },
    );
  }

  /**
   * Function check (403) before object check (404), then the archived
   * Ministry is 404 too. Returns the Ministry, or undefined once refused.
   */
  private async resolveManagedMinistry({
    request,
    reply,
  }: ResolveManagedMinistryInput): Promise<MinistryId | undefined> {
    const ministryId = MinistryId.from(
      (request.params as UsualSetupRouteParams).ministryId,
    );
    const denied = await denyMinistryManagement({
      authorityGuard: this.authorityGuard,
      request,
      reply,
      ministryId,
    });
    if (denied) return undefined;
    await this.ministryManager.getActive({
      churchId: ChurchId.from(request.churchId),
      ministryId,
    });
    return ministryId;
  }
}
