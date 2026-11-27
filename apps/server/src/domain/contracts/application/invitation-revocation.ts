import type { ChurchId } from '../../branded-ids';
import type {
  InvitationRevocation,
  MinistryInvitationRepository,
} from '@/domain/contracts/infrastructure/ministry-invitation.repository';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';

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
