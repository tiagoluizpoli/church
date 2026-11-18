import { AssigneeIdentityBadge } from './assignee-identity-badge';
import {
  type AssigneeMembership,
  formatAssigneeRoleLabel,
} from '@/utils/format-assignee-role-label';

export interface AssigneeRoleBadgeProps {
  membership?: AssigneeMembership;
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
  fullNameOnExpand,
}: AssigneeRoleBadgeProps) {
  return (
    <AssigneeIdentityBadge
      roleLabel={formatAssigneeRoleLabel({ membership })}
      fullNameOnExpand={fullNameOnExpand}
    />
  );
}
