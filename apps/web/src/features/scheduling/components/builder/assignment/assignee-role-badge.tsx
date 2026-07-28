import { AssigneeIdentityBadge } from './assignee-identity-badge';
import {
  type AssigneeMembership,
  formatAssigneeRoleLabel,
} from '@/utils/format-assignee-role-label';

export interface AssigneeRoleBadgeProps {
  membership?: AssigneeMembership;
  /**
   * The team this badge is being rendered in the context of — e.g. the team a
   * shift's requirement is scoped to. `undefined` when the surrounding UI has
   * no team of its own, in which case only a ministry-wide "Leader" badge can
   * ever show (FR-013).
   */
  contextTeamId?: string;
  fullNameOnExpand: string;
}

/**
 * The compute-then-render pair — `formatAssigneeRoleLabel` immediately
 * followed by `AssigneeIdentityBadge` — that used to be duplicated at every
 * surface that shows a volunteer's name (chip, dialogs, pickers, the rail
 * card). Centralized so the two can never drift apart across those call
 * sites.
 */
export function AssigneeRoleBadge({
  membership,
  contextTeamId,
  fullNameOnExpand,
}: AssigneeRoleBadgeProps) {
  return (
    <AssigneeIdentityBadge
      roleLabel={formatAssigneeRoleLabel({ membership, contextTeamId })}
      fullNameOnExpand={fullNameOnExpand}
    />
  );
}
