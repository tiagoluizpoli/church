import type { ChurchAccessLevel } from '../../authority/types';
import type { ChurchId, UserId } from '../../branded-ids';
import type { TransactionContext } from './transaction-context';

export interface LockChurchAccessInput {
  churchId: ChurchId;
  tx: TransactionContext;
}

export interface FindChurchAccessTargetInput {
  churchId: ChurchId;
  /** Church Membership id: opaque, not a User or Volunteer id. */
  memberId: string;
  tx: TransactionContext;
}

/** A Church Membership's current Church access and the User holding it. */
export interface ChurchAccessTarget {
  memberId: string;
  userId: UserId;
  accessLevel: ChurchAccessLevel;
}

export interface CountChurchAdminsInput {
  churchId: ChurchId;
  tx: TransactionContext;
}

export interface SaveChurchAccessChangeInput {
  churchId: ChurchId;
  actorId: UserId;
  target: ChurchAccessTarget;
  accessLevel: ChurchAccessLevel;
  correlationId: string;
  changedAt: Date;
  tx: TransactionContext;
}

/**
 * Better Auth's `member.role` is the only Church access store. Every method
 * runs inside the caller's transaction, after `lockChurch`.
 */
export interface ChurchAccessRepository {
  /** Serializes every Church access change of one Church until the transaction ends. */
  lockChurch(input: LockChurchAccessInput): Promise<void>;
  /** The Church's Church Membership, or undefined when missing or in another Church. */
  findTarget(
    input: FindChurchAccessTargetInput,
  ): Promise<ChurchAccessTarget | undefined>;
  countAdmins(input: CountChurchAdminsInput): Promise<number>;
  /** Writes the new access and its one `church_access_changed` audit row. */
  saveChange(input: SaveChurchAccessChangeInput): Promise<void>;
}
