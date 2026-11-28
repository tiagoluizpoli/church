import type { FastifyReply, FastifyRequest } from 'fastify';
import type { MinistryId } from '../../domain/branded-ids';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IMinistryManager } from '../../domain/contracts/application/ministry-manager';

/** What every authority guard reads: who asks, and where a refusal goes. */
export interface AuthorityAccessInput {
  authorityGuard: IAuthorityGuard;
  request: FastifyRequest;
  reply: FastifyReply;
}

export interface DenyUnmanagedMinistryInput extends AuthorityAccessInput {
  ministryId: MinistryId;
}

export interface DenyMinistryManagementInput extends AuthorityAccessInput {
  /** Omit for the function-level check only (403); pass for the object check too (404). */
  ministryId?: MinistryId;
}

export interface ResolveManagedMinistryInput extends AuthorityAccessInput {
  ministryManager: IMinistryManager;
  ministryId: MinistryId;
}

export interface DenyRefusedDecisionInput extends AuthorityAccessInput {
  /** The object decision already taken for this request. */
  allowed: boolean;
}

export interface DenyShiftScopeInput extends AuthorityAccessInput {
  shiftId: string;
}

export interface DenyParticipationScopeInput extends AuthorityAccessInput {
  participationId: string;
}

/** Every Ministry of the Church (a ChurchAdmin), or only the led ones. */
export type LeadershipScope =
  | { kind: 'church' }
  | { kind: 'ministries'; ministryIds: MinistryId[] };

export interface CreateChurchAdminHookInput {
  authorityGuard: IAuthorityGuard;
}

// named-parameters-ignore: Fastify hook signature (request, reply)
export type ChurchAdminHook = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<FastifyReply | undefined>;
