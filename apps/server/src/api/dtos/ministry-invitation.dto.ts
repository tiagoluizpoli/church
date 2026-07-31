import { z } from 'zod';
import type { MinistryInvitation } from '../../domain/entities/ministry-invitation';

export const mintMinistryInvitationBodySchema = z.object({
  email: z.string().email(),
  ministryAccessLevel: z.enum(['volunteer', 'leader']),
  roleIds: z.array(z.string()),
});

export const ministryInvitationResponseSchema = z.object({
  id: z.string(),
  kind: z.enum(['ministry-only', 'chained']),
  status: z.enum(['pending', 'accepted', 'rejected', 'canceled']),
  expiresAt: z.string(),
  redemptionPath: z.string(),
});

export type MinistryInvitationResponse = z.infer<
  typeof ministryInvitationResponseSchema
>;

function redemptionPathFor(invitation: MinistryInvitation): string {
  return invitation.kind === 'chained'
    ? `/invitations/church/${invitation.churchInvitationId}`
    : `/invitations/ministry/${invitation.id}`;
}

export const ministryInvitationMapper = {
  toResponse(invitation: MinistryInvitation): MinistryInvitationResponse {
    return {
      id: invitation.id,
      kind: invitation.kind,
      status: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
      redemptionPath: redemptionPathFor(invitation),
    };
  },
};
