import type { AppConfig } from '@church/app-config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { MinistryId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IMinistryInvitationManager } from '../../domain/contracts/application/ministry-invitation-manager';
import type { IMinistryManager } from '../../domain/contracts/application/ministry-manager';

/** The page size the route's own schema defaults and bounds by config. */
export interface MinistryPageLimitQuery {
  limit: number;
}

export interface MinistryRouteParams {
  ministryId: string;
}

export type MinistryInvitationRouteParams = MinistryRouteParams;

export interface MinistryInvitationActionRouteParams {
  ministryId: string;
  invitationId: string;
}

export interface DenyMissingMinistryFunctionInput {
  request: FastifyRequest;
  reply: FastifyReply;
}

export type DenyNonAdminInput = DenyMissingMinistryFunctionInput;

export interface DenyUnmanagedMinistryInput
  extends DenyMissingMinistryFunctionInput {
  ministryId: MinistryId;
}

export interface MinistryControllerDependencies {
  ministryManager: IMinistryManager;
  ministryInvitationManager: IMinistryInvitationManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: IAuthorityGuard;
  config: Pick<AppConfig, 'ministries'>;
}
