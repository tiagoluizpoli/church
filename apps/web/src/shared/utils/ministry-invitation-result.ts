import { m } from '@church/i18n/messages';
import { z } from 'zod';

/** Search params a Ministry Invitation continuation carries to Home for its result toast; Home never writes. */
export const ministryInvitationResultSearchSchema = z.object({
  joinedMinistry: z.string().optional(),
  invitationDeclined: z.boolean().optional(),
});

export type MinistryInvitationResultSearch = z.infer<
  typeof ministryInvitationResultSearchSchema
>;

export interface MinistryJoinedMessageInput {
  ministryName: string;
}

export function ministryJoinedMessage({
  ministryName,
}: MinistryJoinedMessageInput): string {
  return m.ministry_invitation_joined_toast({ ministryName });
}
