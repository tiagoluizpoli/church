import type { ChurchId, MinistryInvitationId, UserId } from '../../branded-ids';
import type { TransactionContext } from './transaction-context';

/**
 * Spec §7.6: failed identity checks and throttling are recorded here, never
 * in `identity_audit` — this is a security/support tool, not a domain
 * record, so an ordinary preview visit never reaches it.
 */
export interface RecordIdentityMismatchInput {
  churchId?: ChurchId;
  ministryInvitationId?: MinistryInvitationId;
  actorId: UserId;
  correlationId: string;
  now: Date;
  tx?: TransactionContext;
}

export interface SecurityLogRepository {
  recordIdentityMismatch(input: RecordIdentityMismatchInput): Promise<void>;
}
