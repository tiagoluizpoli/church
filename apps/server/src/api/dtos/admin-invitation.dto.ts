import { instantSchema } from '@church/time';
import { z } from 'zod';
import type { AdminInvitation } from '../../domain/contracts/application/ministry-invitation-manager';

export const mintAdminInvitationBodySchema = z.object({
  email: z.string().trim().email(),
});

export const adminInvitationResponseSchema = z.object({
  /** With `id`, the same tagged row identity the Invitations list uses. */
  kind: z.literal('church'),
  id: z.string(),
  churchAccessLevel: z.literal('admin'),
  expiresAt: instantSchema,
  redemptionPath: z.string(),
  /** The T1 was enqueued in the same transaction, so it is not sent yet. */
  deliveryStatus: z.literal('pending'),
  outcome: z.enum(['created', 'upgraded']),
});

export const mintAdminInvitationConflictSchema = z.object({
  error: z.enum([
    'INVITEE_ALREADY_CHURCH_MEMBER',
    'PENDING_CHURCH_INVITATION_EXISTS',
  ]),
  message: z.string(),
});

export type AdminInvitationResponse = z.infer<
  typeof adminInvitationResponseSchema
>;

export const adminInvitationMapper = {
  toResponse(invitation: AdminInvitation): AdminInvitationResponse {
    return {
      kind: 'church',
      id: invitation.churchInvitationId,
      churchAccessLevel: 'admin',
      expiresAt: invitation.expiresAt,
      redemptionPath: `/invitations/church/${invitation.churchInvitationId}`,
      deliveryStatus: 'pending',
      outcome: invitation.outcome,
    };
  },
};
