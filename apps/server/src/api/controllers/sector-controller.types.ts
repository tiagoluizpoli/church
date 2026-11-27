import type { FastifyReply, FastifyRequest } from 'fastify';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IMinistryManager } from '../../domain/contracts/application/ministry-manager';
import type { ISectorManager } from '../../domain/contracts/application/sector-manager';

export interface SectorsRouteParams {
  ministryId: string;
}

export interface SectorRouteParams extends SectorsRouteParams {
  sectorId: string;
}

export interface ResolveManagedMinistryInput {
  request: FastifyRequest;
  reply: FastifyReply;
}

export interface SectorControllerDependencies {
  ministryManager: IMinistryManager;
  sectorManager: ISectorManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: IAuthorityGuard;
}
