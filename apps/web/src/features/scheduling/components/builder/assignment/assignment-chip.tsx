import { m } from '@church/i18n/messages';
import { AssigneeRoleBadge } from './assignee-role-badge';
import { Badge } from '@/components/ui/badge';
import { useFormControlSize } from '@/components/ui/form-control-size';
import { cn } from '@/lib/utils';
import type { AssigneeMembership } from '@/utils/format-assignee-role-label';

export type ConflictStatus = 'double_booked' | 'unavailable';

/**
 * Where this row stands with the *server*: without it a write still in
 * flight, one that saved a moment ago and one that saved last week are the
 * same pixels.
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
  syncState?: AssignmentSyncState;
  onClick?: () => void;
  readOnly?: boolean;
}

export function AssignmentChip({
  volunteerName,
  volunteerMembership,
  conflictStatus,
  syncState = 'saved',
  onClick,
  readOnly = false,
}: AssignmentChipProps) {
  const isTouch = useFormControlSize() === 'touch';
  const Tag = readOnly ? 'span' : 'button';
  return (
    <Tag
      type={readOnly ? undefined : 'button'}
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
      </span>
    </Tag>
  );
}
