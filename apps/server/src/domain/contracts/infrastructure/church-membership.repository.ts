import type { ChurchAccessLevel } from '../../authority/types';
import type { ChurchId, UserId } from '../../branded-ids';
import type { TransactionContext } from './transaction-context';

export interface ChurchMembershipSummary {
  churchId: ChurchId;
  accessLevel: ChurchAccessLevel;
}

/** One row of the Active Church selector's compare-access listing (spec.md §1.5). */
export interface ChurchMembershipComparison extends ChurchMembershipSummary {
  churchName: string;
  timezone: string;
  lastOpenedAt: Date | null;
}

export interface ListChurchMembershipsByUserIdInput {
  userId: UserId;
  tx?: TransactionContext;
}

export interface TouchChurchMembershipOpenedInput {
  userId: UserId;
  churchId: ChurchId;
  tx?: TransactionContext;
}

/**
 * Lists every Church Membership a User holds, independent of any active
 * Church. Used to decide between auto-selection and the selector when the
 * session carries no active organization — `AuthorityActorRepository.resolveActor`
 * is the source of truth once an active Church is known.
 */
export interface ChurchMembershipRepository {
  listByUserId(
    input: ListChurchMembershipsByUserIdInput,
  ): Promise<ChurchMembershipSummary[]>;
  /** Every Church Membership a User holds, with the identity/comparison facts the selector needs. */
  listComparisonsByUserId(
    input: ListChurchMembershipsByUserIdInput,
  ): Promise<ChurchMembershipComparison[]>;
  /** Records that a Church was just entered — called on every successful Active Church resolution that changes context (auto-select or explicit selection), never on every scoped request. */
  touchOpened(input: TouchChurchMembershipOpenedInput): Promise<void>;
}
