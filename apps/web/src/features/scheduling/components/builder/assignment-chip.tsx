import { Badge } from '@church/ui/components/badge';
import { cn } from '@church/ui/lib/utils';
import { Check, Clock, X } from 'lucide-react';
import { AssigneeIdentityBadge } from './assignee-identity-badge';
import {
  type AssigneeSystemRole,
  formatAssigneeRoleLabel,
} from '@/utils/format-assignee-role-label';
import { formatVolunteerName } from '@/utils/format-volunteer-name';

export type ConflictStatus = 'double_booked' | 'unavailable';
export type ConfirmationStatus = 'pending' | 'confirmed' | 'declined';

interface AssignmentChipProps {
  volunteerName: string;
  volunteerSystemRole?: AssigneeSystemRole;
  conflictStatus?: ConflictStatus;
  confirmationStatus?: ConfirmationStatus;
  isPublished: boolean;
  onClick?: () => void;
}

export function AssignmentChip({
  volunteerName,
  volunteerSystemRole,
  conflictStatus,
  confirmationStatus,
  isPublished,
  onClick,
}: AssignmentChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'radius-control flex w-full items-center justify-between gap-1 border px-2 py-1 text-left text-xs transition-colors hover:bg-muted/50',
        conflictStatus === 'unavailable' &&
          'border-destructive/40 bg-destructive/10',
        conflictStatus === 'double_booked' && 'border-primary/35 bg-primary/8',
      )}
      data-testid="assignment-chip"
    >
      <span className="flex items-center gap-1 truncate">
        {formatVolunteerName(volunteerName)}
        <AssigneeIdentityBadge
          roleLabel={formatAssigneeRoleLabel(volunteerSystemRole)}
          fullNameOnExpand={volunteerName}
        />
      </span>

      <span className="flex items-center gap-1">
        {conflictStatus && (
          <Badge
            className={cn(
              conflictStatus === 'unavailable'
                ? 'bg-destructive text-white'
                : 'bg-primary text-primary-foreground',
            )}
            data-testid="conflict-badge"
          >
            {conflictStatus === 'unavailable' ? 'Unavailable' : 'Double-booked'}
          </Badge>
        )}

        {isPublished && confirmationStatus && (
          <span data-testid="confirmation-badge">
            {confirmationStatus === 'confirmed' && (
              <Check className="size-3 text-green-600" aria-label="confirmed" />
            )}
            {confirmationStatus === 'declined' && (
              <X className="size-3 text-red-600" aria-label="declined" />
            )}
            {confirmationStatus === 'pending' && (
              <Clock
                className="size-3 text-muted-foreground"
                aria-label="pending"
              />
            )}
          </span>
        )}
      </span>
    </button>
  );
}
