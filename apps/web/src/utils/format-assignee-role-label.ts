import { m } from '@church/i18n/messages';

export type MinistryAccessLevel = 'leader' | 'volunteer';

export type AssigneeRoleLabel = string;

/** What `formatAssigneeRoleLabel` needs to know about one volunteer's standing. */
export interface AssigneeMembership {
  ministryAccessLevel: MinistryAccessLevel;
}

export interface FormatAssigneeRoleLabelInput {
  membership: AssigneeMembership | undefined;
}

/** Maps a volunteer's ministry access level to the badge label shown next to their name. */
export function formatAssigneeRoleLabel({
  membership,
}: FormatAssigneeRoleLabelInput): AssigneeRoleLabel | undefined {
  return membership?.ministryAccessLevel === 'leader'
    ? m.ministry_invitation_access_leader()
    : undefined;
}
