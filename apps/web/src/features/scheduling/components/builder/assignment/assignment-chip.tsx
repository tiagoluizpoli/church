import { appConfig } from '@church/app-config';
import { m } from '@church/i18n/messages';
import { Check, Clock, X } from 'lucide-react';
import { AssigneeRoleBadge } from './assignee-role-badge';
import { Badge } from '@/components/ui/badge';
import { useFormControlSize } from '@/components/ui/form-control-size';
import { cn } from '@/lib/utils';
import type { AssigneeMembership } from '@/utils/format-assignee-role-label';

export type ConflictStatus = 'double_booked' | 'unavailable';
export type ConfirmationStatus = 'pending' | 'confirmed' | 'declined';

/**
 * Where this row stands with the *server*, which is a different question from
 * `confirmationStatus` (where the volunteer stands with the assignment). A
 * pre-publish board never renders a confirmation icon, so without this a write
 * still in flight, one that saved a moment ago and one that saved last week are
 * the same pixels.
 */
export type AssignmentSyncState = 'pending' | 'saved' | 'failed';

const syncStateLabels = (): Record<AssignmentSyncState, string> => ({
  pending: m.builder_ui_saving(),
  saved: m.builder_ui_saved(),
  failed: m.builder_ui_not_saved(),
});

interface AssignmentChipProps {
  volunteerName: string;
  volunteerMembership?: AssigneeMembership;
  conflictStatus?: ConflictStatus;
  confirmationStatus?: ConfirmationStatus;
  isPublished: boolean;
  syncState?: AssignmentSyncState;
  onClick?: () => void;
}

export function AssignmentChip({
  volunteerName,
  volunteerMembership,
  conflictStatus,
  confirmationStatus,
  isPublished,
  syncState = 'saved',
  onClick,
}: AssignmentChipProps) {
  const { assignmentResponse } = appConfig.parked;
  const isTouch = useFormControlSize() === 'touch';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'radius-control inline-flex max-w-full items-center justify-between gap-1 border px-2 py-1 text-left text-xs transition-colors hover:bg-muted/50',
        isTouch && 'min-h-11 px-3 py-2 text-sm',
        conflictStatus === 'unavailable' &&
          'border-destructive/40 bg-destructive/10',
        conflictStatus === 'double_booked' && 'border-primary/35 bg-primary/8',
        // Dotted rather than dashed: dashed is already the board's vocabulary
        // for "not committed yet" (the Add and Assign pills), and this row IS
        // committed — it is only the round trip that is outstanding. No
        // spinner; a chip that twitches on every write is worse than a chip
        // that reads as provisional.
        syncState === 'pending' && 'border-dotted opacity-60',
        syncState === 'failed' &&
          'border-destructive bg-destructive/10 text-destructive',
      )}
      data-sync-state={syncState}
      data-testid="assignment-chip"
    >
      <span className="flex items-center gap-1 truncate">
        {syncState !== 'saved' ? (
          <span className="sr-only">{syncStateLabels()[syncState]} — </span>
        ) : null}
        {volunteerName}
        <AssigneeRoleBadge
          membership={volunteerMembership}
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
            {conflictStatus === 'unavailable'
              ? m.builder_state_unavailable()
              : m.builder_ui_double_booked()}
          </Badge>
        )}

        {assignmentResponse && isPublished && confirmationStatus && (
          <span data-testid="confirmation-badge">
            {confirmationStatus === 'confirmed' && (
              <Check
                className="size-3 text-green-600"
                aria-label={m.builder_ui_confirmed()}
              />
            )}
            {confirmationStatus === 'declined' && (
              <X
                className="size-3 text-destructive"
                aria-label={m.builder_ui_declined()}
              />
            )}
            {confirmationStatus === 'pending' && (
              <Clock
                className="size-3 text-muted-foreground"
                aria-label={m.builder_ui_pending()}
              />
            )}
          </span>
        )}
      </span>
    </button>
  );
}
