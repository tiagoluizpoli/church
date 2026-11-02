import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  ChurchId,
  MinistryId,
  SectorId,
  UserId,
} from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IMinistryManager } from '../../domain/contracts/application/ministry-manager';
import type { ISectorManager } from '../../domain/contracts/application/sector-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { AuthorityGuard } from '../auth/authority-guard';
import type { FastifyController } from '../contracts/fastify-controller';
import { archiveBlockedResponseSchema } from '../dtos/archive-blocker.dto';
import {
  type SectorNameBody,
  sectorListResponseSchema,
  sectorMapper,
  sectorNameBodySchema,
  sectorResponseSchema,
} from '../dtos/sector.dto';
import { refuse } from '../utils/refuse';

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

interface SectorsRouteParams {
  ministryId: string;
}

interface SectorRouteParams extends SectorsRouteParams {
  sectorId: string;
}

interface ResolveManagedMinistryInput {
  request: FastifyRequest;
  reply: FastifyReply;
}

interface SectorControllerDependencies {
  ministryManager: IMinistryManager;
  sectorManager: ISectorManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: AuthorityGuard;
}

/** A Ministry's Sector registry, for ChurchAdmins and the Ministry's own leaders. */
export class SectorController implements FastifyController {
  readonly prefix = '/ministries/:ministryId/sectors';

  private readonly ministryManager: IMinistryManager;
  private readonly sectorManager: ISectorManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: AuthorityGuard;

  constructor({
    ministryManager,
    sectorManager,
    activeChurchResolver,
    authorityGuard,
  }: SectorControllerDependencies) {
    this.ministryManager = ministryManager;
    this.sectorManager = sectorManager;
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
          operationId: 'listSectors',
          summary: "List a Ministry's active Sectors",
          description:
            "List the managed Ministry's active Sectors, alphabetically ignoring case.",
          response: {
            200: sectorListResponseSchema,
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
        const sectors = await this.sectorManager.list({
          churchId: ChurchId.from(request.churchId),
          ministryId,
        });
        return reply.send(sectorMapper.toResponseList(sectors));
      },
    );

    app.post(
      '/',
      {
        schema: {
          tags: ['ministries'],
          operationId: 'createSector',
          summary: 'Add a Sector',
          description:
            'Add an active Sector to the managed Ministry; active names are unique within it ignoring case.',
          body: sectorNameBodySchema,
          response: {
            201: sectorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const ministryId = await this.resolveManagedMinistry({
          request,
          reply,
        });
        if (!ministryId) return;
        const { name } = request.body as SectorNameBody;
        const sector = await this.sectorManager.create({
          churchId: ChurchId.from(request.churchId),
          ministryId,
          name,
        });
        return reply.status(201).send(sectorMapper.toResponse(sector));
      },
    );

    app.patch(
      '/:sectorId',
      {
        schema: {
          tags: ['ministries'],
          operationId: 'renameSector',
          summary: 'Rename a Sector',
          description:
            'Rename an active Sector, keeping its identity, so history shows the new name too.',
          body: sectorNameBodySchema,
          response: {
            200: sectorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const ministryId = await this.resolveManagedMinistry({
          request,
          reply,
        });
        if (!ministryId) return;
        const { sectorId } = request.params as SectorRouteParams;
        const { name } = request.body as SectorNameBody;
        const sector = await this.sectorManager.rename({
          churchId: ChurchId.from(request.churchId),
          ministryId,
          sectorId: SectorId.from(sectorId),
          name,
        });
        return reply.send(sectorMapper.toResponse(sector));
      },
    );

    app.post(
      '/:sectorId/archive',
      {
        schema: {
          tags: ['ministries'],
          operationId: 'archiveSector',
          summary: 'Archive a Sector',
          description:
            'Retire an active Sector from new use, keeping its history. Refused with typed blocker locations while upcoming ShiftRequirements or a UsualSetup headcount use it.',
          response: {
            204: z.null(),
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: archiveBlockedResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const ministryId = await this.resolveManagedMinistry({
          request,
          reply,
        });
        if (!ministryId) return;
        const { sectorId } = request.params as SectorRouteParams;
        await this.sectorManager.archive({
          churchId: ChurchId.from(request.churchId),
          ministryId,
          sectorId: SectorId.from(sectorId),
        });
        return reply.status(204).send(null);
      },
    );
  }

  /**
   * Function check (403) before object check (404), then the archived parent
   * is 404 too. Returns the Ministry, or undefined once a refusal was sent.
   */
  private async resolveManagedMinistry({
    request,
    reply,
  }: ResolveManagedMinistryInput): Promise<MinistryId | undefined> {
    const churchId = ChurchId.from(request.churchId);
    const userId = UserId.from(request.userId);
    const anyMinistry = await this.authorityGuard.decideManageAnyMinistry({
      churchId,
      userId,
    });
    if (!anyMinistry.allowed) {
      refuse({ reply, request, code: 'FORBIDDEN' });
      return undefined;
    }
    const ministryId = MinistryId.from(
      (request.params as SectorsRouteParams).ministryId,
    );
    const decision = await this.authorityGuard.decideManageMinistry({
      churchId,
      userId,
      ministryId,
    });
    if (!decision.allowed) {
      refuse({ reply, request, code: 'NOT_FOUND' });
      return undefined;
    }
    await this.ministryManager.getActive({ churchId, ministryId });
    return ministryId;
  }
}
