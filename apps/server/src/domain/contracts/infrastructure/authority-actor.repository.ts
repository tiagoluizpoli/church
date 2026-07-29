import type { AuthorityActor } from '../../authority/types';
import type { ChurchId, UserId } from '../../branded-ids';
import type { TransactionContext } from './transaction-context';

export interface ResolveAuthorityActorInput {
  userId: UserId;
  activeChurchId: ChurchId;
  tx?: TransactionContext;
}

/**
 * Builds the `AuthorityActor` AuthorityService evaluates against, resolving
 * verified User, Church Membership and Active Church from the authentication
 * adapter, and Ministry Membership, Team Membership, Role and ownership from
 * the domain repositories.
 */
export interface AuthorityActorRepository {
  resolveActor(input: ResolveAuthorityActorInput): Promise<AuthorityActor>;
}
