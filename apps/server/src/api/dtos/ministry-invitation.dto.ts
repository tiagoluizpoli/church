import { instantSchema } from '@church/time';
import { z } from 'zod';
import type { MinistryInvitationDeliveryStatus } from '../../domain/contracts/application/ministry-invitation-manager';
import { MINISTRY_INVITATION_DELIVERY_STATUS_OPTIONS } from '../../domain/contracts/application/ministry-invitation-manager';
import type { MinistryInvitation } from '../../domain/entities/ministry-invitation';
import { MINISTRY_INVITATION_STATUS_OPTIONS } from '../../domain/entities/ministry-invitation';
import { MINISTRY_ACCESS_LEVEL_OPTIONS } from '../../domain/entities/ministry-membership';
import { redemptionPathFor } from '../../domain/services/ministry-invitation-redemption-path';
import { validationErrorResponseSchema } from './validation-error.dto';

export const mintMinistryInvitationBodySchema = z.object({
  email: z.string().trim().email(),
  ministryAccessLevel: z.enum(MINISTRY_ACCESS_LEVEL_OPTIONS),
  roleIds: z.array(z.string()),
});

export const ministryInvitationResponseSchema = z.object({
  id: z.string(),
  kind: z.enum(['ministry-only', 'chained']),
  status: z.enum(MINISTRY_INVITATION_STATUS_OPTIONS),
  expiresAt: instantSchema,
  redemptionPath: z.string(),
  /**
   * The invitation's most recent outbox message status (spec #56 §6.4).
   * Both mint and resend enqueue an outbox message before returning, so
   * this is always present — never `null`.
   */
  deliveryStatus: z.enum(MINISTRY_INVITATION_DELIVERY_STATUS_OPTIONS),
});

/** 409 refusals; a duplicate points at the scope-checked original offer. */
export const mintMinistryInvitationConflictSchema = z.object({
  error: z.enum([
    'PENDING_MINISTRY_INVITATION_EXISTS',
    'INVITEE_ALREADY_MINISTRY_MEMBER',
  ]),
  message: z.string(),
  existingInvitation: z
    .object({ id: z.string(), createdAt: instantSchema })
    .optional(),
});

/** 422 refusals: request/domain validation, or a Role outside the active catalogue. */
export const mintMinistryInvitationUnprocessableSchema =
  validationErrorResponseSchema.extend({
    error: z.enum(['VALIDATION_ERROR', 'INVALID_INVITATION_ROLE']),
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
      expiresAt: invitation.expiresAt,
      redemptionPath: redemptionPathFor(invitation),
      deliveryStatus,
    };
  },
};
