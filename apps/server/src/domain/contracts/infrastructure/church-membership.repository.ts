import type { ChurchAccessLevel } from '../../authority/types';
import type { ChurchId, UserId } from '../../branded-ids';
import type { TransactionContext } from './transaction-context';

export interface ChurchMembershipSummary {
  churchId: ChurchId;
  accessLevel: ChurchAccessLevel;
}

export interface ListChurchMembershipsByUserIdInput {
  userId: UserId;
  tx?: TransactionContext;
}

/**
 * Lists every Church Membership a User holds, independent of any active
 * Church. Used only to decide between auto-selection and the (not yet
 * built) selector when the session carries no active organization —
 * `AuthorityActorRepository.resolveActor` is the source of truth once an
 * active Church is known.
 */
export interface ChurchMembershipRepository {
  listByUserId(
    input: ListChurchMembershipsByUserIdInput,
  ): Promise<ChurchMembershipSummary[]>;
}
