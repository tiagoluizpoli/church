import { z } from 'zod';
import { MinistryId, SectorId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IMinistryManager } from '../../domain/contracts/application/ministry-manager';
import type { ISectorManager } from '../../domain/contracts/application/sector-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import { resolveManagedMinistry } from '../auth/authority-access';
import type { FastifyController } from '../contracts/fastify-controller';
import { archiveBlockedResponseSchema } from '../dtos/archive-blocker.dto';
import {
  authErrorResponses,
  errorResponseSchema,
} from '../dtos/error-response.dto';
import { ministryParamsSchema } from '../dtos/id.dto';
import {
  sectorListResponseSchema,
  sectorMapper,
  sectorNameBodySchema,
  sectorParamsSchema,
  sectorResponseSchema,
} from '../dtos/sector.dto';
import type { SectorControllerDependencies } from './sector-controller.types';

/** A Ministry's Sector registry, for ChurchAdmins and the Ministry's own leaders. */
export class SectorController implements FastifyController {
  readonly prefix = '/ministries/:ministryId/sectors';

  private readonly ministryManager: IMinistryManager;
  private readonly sectorManager: ISectorManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: IAuthorityGuard;

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
          params: ministryParamsSchema,
          response: {
            200: sectorListResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const ministryId = await resolveManagedMinistry({
          authorityGuard: this.authorityGuard,
          ministryManager: this.ministryManager,
          request,
          ministryId: MinistryId.from(request.params.ministryId),
        });
        const sectors = await this.sectorManager.list({
          churchId: request.churchId,
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
          params: ministryParamsSchema,
          body: sectorNameBodySchema,
          response: {
            201: sectorResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const ministryId = await resolveManagedMinistry({
          authorityGuard: this.authorityGuard,
          ministryManager: this.ministryManager,
          request,
          ministryId: MinistryId.from(request.params.ministryId),
        });
        const { name } = request.body;
        const sector = await this.sectorManager.create({
          churchId: request.churchId,
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
          params: sectorParamsSchema,
          body: sectorNameBodySchema,
          response: {
            200: sectorResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const ministryId = await resolveManagedMinistry({
          authorityGuard: this.authorityGuard,
          ministryManager: this.ministryManager,
          request,
          ministryId: MinistryId.from(request.params.ministryId),
        });
        const { sectorId } = request.params;
        const { name } = request.body;
        const sector = await this.sectorManager.rename({
          churchId: request.churchId,
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
          params: sectorParamsSchema,
          response: {
            204: z.null(),
            ...authErrorResponses,
            404: errorResponseSchema,
            409: archiveBlockedResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const ministryId = await resolveManagedMinistry({
          authorityGuard: this.authorityGuard,
          ministryManager: this.ministryManager,
          request,
          ministryId: MinistryId.from(request.params.ministryId),
        });
        const { sectorId } = request.params;
        await this.sectorManager.archive({
          churchId: request.churchId,
          ministryId,
          sectorId: SectorId.from(sectorId),
        });
        return reply.status(204).send(null);
      },
    );
  }
}
