import { z } from 'zod';
import type { MinistryInvitation } from '../../domain/entities/ministry-invitation';
import { MINISTRY_INVITATION_STATUS_OPTIONS } from '../../domain/entities/ministry-invitation';
import { MINISTRY_ACCESS_LEVEL_OPTIONS } from '../../domain/entities/ministry-volunteer';

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
