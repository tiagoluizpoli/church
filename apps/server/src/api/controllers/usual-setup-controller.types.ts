import type { FastifyReply, FastifyRequest } from 'fastify';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IMinistryManager } from '../../domain/contracts/application/ministry-manager';
import type { IUsualSetupManager } from '../../domain/contracts/application/usual-setup-manager';

export interface UsualSetupRouteParams {
  ministryId: string;
}

export interface UsualSetupBlockRouteParams extends UsualSetupRouteParams {
  sourceTemplateTimeBlockId: string;
}

export interface ResolveManagedMinistryInput {
  request: FastifyRequest;
  reply: FastifyReply;
}

export interface UsualSetupControllerDependencies {
  ministryManager: IMinistryManager;
  usualSetupManager: IUsualSetupManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: IAuthorityGuard;
}
