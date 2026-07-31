import { z } from 'zod';
import type { MinistryInvitationDeliveryStatus } from '../../domain/contracts/application/ministry-invitation-manager';
import { MINISTRY_INVITATION_DELIVERY_STATUS_OPTIONS } from '../../domain/contracts/application/ministry-invitation-manager';
import type { MinistryInvitation } from '../../domain/entities/ministry-invitation';
import { MINISTRY_INVITATION_STATUS_OPTIONS } from '../../domain/entities/ministry-invitation';
import { MINISTRY_ACCESS_LEVEL_OPTIONS } from '../../domain/entities/ministry-volunteer';
import { redemptionPathFor } from '../../domain/services/ministry-invitation-redemption-path';

export const mintMinistryInvitationBodySchema = z.object({
  email: z.string().email(),
  ministryAccessLevel: z.enum(MINISTRY_ACCESS_LEVEL_OPTIONS),
  roleIds: z.array(z.string()),
});

export const ministryInvitationResponseSchema = z.object({
  id: z.string(),
  kind: z.enum(['ministry-only', 'chained']),
  status: z.enum(MINISTRY_INVITATION_STATUS_OPTIONS),
  expiresAt: z.string(),
  redemptionPath: z.string(),
  /**
   * The invitation's most recent outbox message status (spec #56 §6.4).
   * Both mint and resend enqueue an outbox message before returning, so
   * this is always present — never `null`.
   */
  deliveryStatus: z.enum(MINISTRY_INVITATION_DELIVERY_STATUS_OPTIONS),
});

export type MinistryInvitationResponse = z.infer<
  typeof ministryInvitationResponseSchema
>;

export interface ToMinistryInvitationResponseInput {
  invitation: MinistryInvitation;
  deliveryStatus: MinistryInvitationDeliveryStatus;
}
export const ministryInvitationMapper = {
  toResponse(
    input: ToMinistryInvitationResponseInput,
  ): MinistryInvitationResponse {
    const { invitation, deliveryStatus } = input;
    return {
      id: invitation.id,
      kind: invitation.kind,
      status: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
      redemptionPath: redemptionPathFor(invitation),
      deliveryStatus,
    };
  },
};
