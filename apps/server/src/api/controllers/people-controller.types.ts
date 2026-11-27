import type { AppConfig } from '@church/app-config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthorityActor } from '../../domain/authority/types';
import type { ChurchId, UserId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IChurchAccessManager } from '../../domain/contracts/application/church-access-manager';
import type { IMinistryMembershipManager } from '../../domain/contracts/application/ministry-membership-manager';
import type { IPeopleListManager } from '../../domain/contracts/application/people-list-manager';

/** The page size the route's own schema bounds by the configured maximum. */
export interface ListLimitQuery {
  limit?: number;
}

export interface ResolveScopeInput {
  churchId: ChurchId;
  userId: UserId;
  /** The caller as Active Church resolution read it for this request. */
  actor?: AuthorityActor;
}

/** Any Ministry Membership manager outcome: a hidden or refused target, or the applied change. */
export type MembershipOutcome =
  | { kind: 'forbidden' }
  | { kind: 'not-found' }
  | { kind: 'applied' };

export interface SendMembershipOutcomeInput {
  reply: FastifyReply;
  request: FastifyRequest;
  outcome: MembershipOutcome;
}

export interface PeopleControllerDependencies {
  peopleListManager: IPeopleListManager;
  churchAccessManager: IChurchAccessManager;
  ministryMembershipManager: IMinistryMembershipManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: IAuthorityGuard;
  config: Pick<AppConfig, 'people'>;
}
