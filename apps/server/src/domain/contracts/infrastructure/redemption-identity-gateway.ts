import type { ChurchId, UserId } from '../../branded-ids';
import type { TransactionContext } from './transaction-context';

/** Never signs in an existing User: sign-up refuses an email that has one. */
export interface CreateRedemptionAccountInput {
  email: string;
  name: string;
  password: string;
  /** Joins the caller's transaction, so a later failure rolls the identity back. */
  tx?: TransactionContext;
}

export interface CreateRedemptionAccountOutput {
  userId: UserId;
  sessionCookie: string;
}

export interface AcceptChurchInvitationInput {
  churchInvitationId: string;
  sessionCookie: string;
  tx?: TransactionContext;
}

/** Caller decides whether to invoke this — only meaningful while the Church Invitation is still `pending`. */
export interface RejectChurchInvitationInput {
  churchInvitationId: string;
  sessionCookie: string;
}

export interface SetActiveRedemptionChurchInput {
  churchId: ChurchId;
  sessionCookie: string;
  tx?: TransactionContext;
}

export interface IsEmailRegisteredInput {
  email: string;
}

export interface VerifyPasswordInput {
  email: string;
  password: string;
}

export interface RedemptionIdentityGateway {
  createAccount(
    input: CreateRedemptionAccountInput,
  ): Promise<CreateRedemptionAccountOutput>;
  acceptChurchInvitation(input: AcceptChurchInvitationInput): Promise<void>;
  rejectChurchInvitation(input: RejectChurchInvitationInput): Promise<void>;
  setActiveChurch(input: SetActiveRedemptionChurchInput): Promise<void>;
  /** Read outside any transaction: whether a committed User owns the email. */
  isEmailRegistered(input: IsEmailRegisteredInput): Promise<boolean>;
  /**
   * Spec §8.7 layer 3: server-side password check that issues **no** new
   * session — any cookie Better Auth returns is discarded. `true` only when
   * the credentials are valid.
   */
  verifyPassword(input: VerifyPasswordInput): Promise<boolean>;
}
