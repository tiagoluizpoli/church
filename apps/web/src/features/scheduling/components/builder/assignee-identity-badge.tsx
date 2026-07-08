import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { AssigneeRoleLabel } from '@/utils/format-assignee-role-label';

export interface AssigneeIdentityBadgeProps {
  roleLabel?: AssigneeRoleLabel;
  fullNameOnExpand: string;
}

/**
 * Disambiguates two assignees who truncate to the same short name (FR-013,
 * e.g. "Local Leader"/"Local Sub Leader" both render as "Local L."). Badge is
 * always visible when a role is present; the full untruncated name shows on
 * hover/expand. Renders nothing for plain volunteers (no role to disambiguate).
 */
export function AssigneeIdentityBadge({
  roleLabel,
  fullNameOnExpand,
}: AssigneeIdentityBadgeProps) {
  if (!roleLabel) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge variant="outline" data-testid="assignee-role-badge">
            {roleLabel}
          </Badge>
        }
      />
      <TooltipContent>{fullNameOnExpand}</TooltipContent>
    </Tooltip>
  );
}
