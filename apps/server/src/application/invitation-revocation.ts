import type { ChurchId } from '../domain/branded-ids';
import type {
  InvitationRevocation,
  MinistryInvitationRepository,
} from '../domain/contracts/infrastructure/ministry-invitation.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';

/**
 * Transaction-bound revocation steps shared by manual revoke, direct Church
 * revoke and Ministry archive. Each runs inside the caller's transaction and
 * never commits on its own; the caller already holds any Ministry lock, and
 * these take the Church Invitation row before Ministry Invitation rows (the
 * order documented on `acquireChurchOfferLock`).
 */
export interface RevokeMinistryHalfInput {
  repo: MinistryInvitationRepository;
  churchId: ChurchId;
  ministryInvitationId: string;
  /** The Church Invitation the half is paired with, if any. */
  churchInvitationId?: string | null;
  revocation: InvitationRevocation;
  tx: TransactionContext;
}

export interface RevokeChurchOfferInput {
  repo: MinistryInvitationRepository;
  churchId: ChurchId;
  churchInvitationId: string;
  revocation: InvitationRevocation;
  tx: TransactionContext;
}

/**
 * Cancels one stored-pending Ministry Invitation, then its still-pending
 * Church Invitation when no other stored-pending half (expired included)
 * still uses it — admin-upgraded parents too. `false` when the target was no
 * longer pending: nothing changed.
 */
export async function revokeMinistryHalf({
  repo,
  churchId,
  ministryInvitationId,
  churchInvitationId,
  revocation,
  tx,
}: RevokeMinistryHalfInput): Promise<boolean> {
  // Parent first: serializes parallel sibling revokes and sibling mints.
  if (churchInvitationId) {
    await repo.lockChurchInvitation({ churchId, churchInvitationId, tx });
  }
  const canceled = await repo.cancelMinistryInvitation({
    churchId,
    ministryInvitationId,
    revocation,
    tx,
  });
  if (!canceled || !churchInvitationId) return canceled;
  const remaining = await repo.lockPendingHalves({
    churchId,
    churchInvitationId,
    tx,
  });
  if (remaining.length === 0) {
    await repo.cancelChurchInvitation({
      churchId,
      churchInvitationId,
      revocation,
      tx,
    });
  }
  return true;
}

/**
 * Cancels a stored-pending Church Invitation and every still-pending Ministry
 * half using it; completed halves stay as they are. `false` when the Church
 * Invitation was no longer pending: nothing changed.
 */
export async function revokeChurchOffer({
  repo,
  churchId,
  churchInvitationId,
  revocation,
  tx,
}: RevokeChurchOfferInput): Promise<boolean> {
  const canceled = await repo.cancelChurchInvitation({
    churchId,
    churchInvitationId,
    revocation,
    tx,
  });
  if (!canceled) return false;
  const halves = await repo.lockPendingHalves({
    churchId,
    churchInvitationId,
    tx,
  });
  for (const ministryInvitationId of halves) {
    await repo.cancelMinistryInvitation({
      churchId,
      ministryInvitationId,
      revocation,
      tx,
    });
  }
  return true;
}
