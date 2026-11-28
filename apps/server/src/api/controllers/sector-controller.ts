import { z } from 'zod';
import { ChurchId, MinistryId, SectorId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IMinistryManager } from '../../domain/contracts/application/ministry-manager';
import type { ISectorManager } from '../../domain/contracts/application/sector-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { FastifyController } from '../contracts/fastify-controller';
import { archiveBlockedResponseSchema } from '../dtos/archive-blocker.dto';
import {
  sectorListResponseSchema,
  sectorMapper,
  sectorNameBodySchema,
  sectorResponseSchema,
} from '../dtos/sector.dto';
import { refuse } from '../utils/refuse';
import { requestCaller } from '../utils/request-caller';
import type {
  ResolveManagedMinistryInput,
  SectorControllerDependencies,
  SectorRouteParams,
  SectorsRouteParams,
} from './sector-controller.types';

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

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
        const { name } = request.body;
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
        const { name } = request.body;
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
    const caller = requestCaller({ request });
    const { churchId } = caller;
    const anyMinistry =
      await this.authorityGuard.decideManageAnyMinistry(caller);
    if (!anyMinistry.allowed) {
      refuse({ reply, request, code: 'FORBIDDEN' });
      return undefined;
    }
    const ministryId = MinistryId.from(
      (request.params as SectorsRouteParams).ministryId,
    );
    const decision = await this.authorityGuard.decideManageMinistry({
      ...caller,
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
