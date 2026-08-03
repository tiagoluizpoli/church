import type { ChurchId, UserId } from '../../branded-ids';

export interface CreateRedemptionAccountInput {
  email: string;
  name: string;
  password: string;
}

export interface CreateRedemptionAccountOutput {
  userId: UserId;
  sessionToken: string;
  sessionCookie: string;
}

export interface AcceptChurchInvitationInput {
  churchInvitationId: string;
  sessionToken: string;
}

export interface SetActiveRedemptionChurchInput {
  churchId: ChurchId;
  sessionToken: string;
}

export interface RedemptionIdentityGateway {
  createAccount(
    input: CreateRedemptionAccountInput,
  ): Promise<CreateRedemptionAccountOutput>;
  acceptChurchInvitation(input: AcceptChurchInvitationInput): Promise<void>;
  setActiveChurch(input: SetActiveRedemptionChurchInput): Promise<void>;
}
