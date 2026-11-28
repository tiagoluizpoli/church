import type { FastifyRequest } from 'fastify';
import type { MinistryId } from '../../domain/branded-ids';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IMinistryManager } from '../../domain/contracts/application/ministry-manager';

/** What every authority guard reads: who asks. */
export interface AuthorityAccessInput {
  authorityGuard: IAuthorityGuard;
  request: FastifyRequest;
}

export interface AssertManagedMinistryInput extends AuthorityAccessInput {
  ministryId: MinistryId;
}

export interface ResolveManagedMinistryInput extends AuthorityAccessInput {
  ministryManager: IMinistryManager;
  ministryId: MinistryId;
}

export interface AssertAllowedDecisionInput extends AuthorityAccessInput {
  /** The object decision already taken for this request. */
  allowed: boolean;
}

export interface AssertShiftScopeInput extends AuthorityAccessInput {
  shiftId: string;
}

export interface AssertParticipationScopeInput extends AuthorityAccessInput {
  participationId: string;
}

/** Every Ministry of the Church (a ChurchAdmin), or only the led ones. */
export type LeadershipScope =
  | { kind: 'church' }
  | { kind: 'ministries'; ministryIds: MinistryId[] };

export interface CreateChurchAdminHookInput {
  authorityGuard: IAuthorityGuard;
}

export type ChurchAdminHook = (request: FastifyRequest) => Promise<void>;
