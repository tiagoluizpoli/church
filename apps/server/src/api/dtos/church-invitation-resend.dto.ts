import { instantSchema } from '@church/time';
import { z } from 'zod';
import type { ChurchInvitationResend } from '../../domain/contracts/application/ministry-invitation-manager';

export const churchInvitationResendResponseSchema = z.object({
  /** With `id`, the same tagged row identity the Invitations list uses. */
  kind: z.literal('church'),
  id: z.string(),
  expiresAt: instantSchema,
  /** The T1 was enqueued in the same transaction, so it is not sent yet. */
  deliveryStatus: z.literal('pending'),
});

export const churchInvitationResendMapper = {
  toResponse(resend: ChurchInvitationResend) {
    return {
      kind: 'church' as const,
      id: resend.churchInvitationId,
      expiresAt: resend.expiresAt,
      deliveryStatus: 'pending' as const,
    };
  },
};
