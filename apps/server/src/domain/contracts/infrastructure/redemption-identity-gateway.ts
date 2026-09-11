import type { ChurchId, UserId } from '../../branded-ids';

export interface CreateRedemptionAccountInput {
  email: string;
  name: string;
  password: string;
}

export interface CreateRedemptionAccountOutput {
  userId: UserId;
  sessionCookie: string;
}

export interface AcceptChurchInvitationInput {
  churchInvitationId: string;
  sessionCookie: string;
}

/** Caller decides whether to invoke this — only meaningful while the Church Invitation is still `pending`. */
export interface RejectChurchInvitationInput {
  churchInvitationId: string;
  sessionCookie: string;
}

export interface SetActiveRedemptionChurchInput {
  churchId: ChurchId;
  sessionCookie: string;
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
  /**
   * Spec §8.7 layer 3: server-side password check that issues **no** new
   * session — any cookie Better Auth returns is discarded. `true` only when
   * the credentials are valid.
   */
  verifyPassword(input: VerifyPasswordInput): Promise<boolean>;
}
