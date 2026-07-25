import { useDroppable } from '@dnd-kit/core';
import { LocateFixed, RotateCcwIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import type { CycleBuilderAssignment } from '../../../hooks/use-cycle-builder';
import { isOptimisticAssignmentId } from '../../../hooks/use-cycle-builder.optimistic';
import type { PickerVolunteer } from '../../../utils/builder/cycle-builder-candidate.types';
import { AssignmentChip } from '../assignment/assignment-chip';
import { AssignmentPicker } from '../assignment/assignment-picker';
import { Button } from '@/components/ui/button';
import { useFormControlSize } from '@/components/ui/form-control-size';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface AssignmentButtonProps {
  assignment: CycleBuilderAssignment;
  shiftId: string;
  roleId: string;
  isPublished: boolean;
  onRemove: () => void;
  onSelect: (input: AssignmentButtonSelectInput) => void;
  pickerVolunteers: PickerVolunteer[];
  onFocus: () => void;
}

export interface AssignmentButtonSelectInput {
  volunteerId: string;
  volunteerName?: string;
}

export function AssignmentButton({
  assignment,
  shiftId,
  roleId,
  isPublished,
  onRemove,
  onSelect,
  pickerVolunteers,
  onFocus,
}: AssignmentButtonProps) {
  const [open, setOpen] = useState(false);
  // The row only carries a client-invented id while the create is in flight, so
  // this is the sync state, not a domain status.
  const isPending = isOptimisticAssignmentId({ assignmentId: assignment.id });
  const replacementTarget = useDroppable({
    id: `cycle-assignment:${assignment.id}`,
    data: { shiftId, roleId, assignmentId: assignment.id },
    // Replacing a row the server has never seen would send it an id it cannot
    // resolve. The window is short; refusing it is cheaper than a 404 toast.
    disabled: isPending,
  });
  const chip = (
    <AssignmentChip
      volunteerName={assignment.volunteerName ?? assignment.volunteerId}
      confirmationStatus={
        assignment.status === 'pending' ||
        assignment.status === 'confirmed' ||
        assignment.status === 'declined'
          ? assignment.status
          : undefined
      }
      isPublished={isPublished}
      syncState={isPending ? 'pending' : 'saved'}
    />
  );

  return (
    <span
      ref={replacementTarget.setNodeRef}
      className={cn(
        'inline-flex max-w-full rounded-full',
        replacementTarget.isOver && 'ring-1 ring-primary ring-offset-1',
      )}
      data-drop-target={isPending ? undefined : 'replace'}
      data-testid={`cycle-assignment-${assignment.id}`}
    >
      {isPending ? (
        chip
      ) : (
        <AssignmentPicker
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (nextOpen) onFocus();
          }}
          trigger={chip}
          volunteers={pickerVolunteers}
          hasAssignment
          onSelect={(volunteerId) => onSelect({ volunteerId })}
          onRemove={onRemove}
        />
      )}
    </span>
  );
}

export interface FailedAssignmentWrite {
  failedWriteId: string;
  shiftId: string;
  roleId: string;
  volunteerId: string;
  volunteerName: string;
  message: string;
}

interface FailedAssignmentChipProps {
  failedWrite: FailedAssignmentWrite;
  onRetry: () => void;
  onDismiss: () => void;
}

/**
 * A write that did not land, left where the leader watched it appear. Rolling
 * the row out of the board and reporting the failure four seconds later in a
 * corner toast asks her to notice an absence — the one thing a dense grid is
 * worst at showing.
 */
export function FailedAssignmentChip({
  failedWrite,
  onRetry,
  onDismiss,
}: FailedAssignmentChipProps) {
  const isTouch = useFormControlSize() === 'touch';

  return (
    <span
      className="inline-flex max-w-full flex-col gap-0.5"
      data-testid={`cycle-failed-assignment-${failedWrite.failedWriteId}`}
    >
      <span className="inline-flex max-w-full items-center gap-1">
        {/* The toast that reported this is long gone by the time she looks at
            the cell, so the reason has to be reachable from the chip itself. */}
        <Tooltip>
          <TooltipTrigger
            render={
              <AssignmentChip
                volunteerName={failedWrite.volunteerName}
                isPublished={false}
                syncState="failed"
              />
            }
          />
          <TooltipContent>{failedWrite.message}</TooltipContent>
        </Tooltip>
        <Button
          type="button"
          size={isTouch ? 'touch' : 'sm'}
          variant="ghost"
          className={cn(
            'h-7 gap-1 px-2 text-xs',
            isTouch && 'h-11 px-3 text-sm',
          )}
          aria-label={`Retry assigning ${failedWrite.volunteerName} — ${failedWrite.message}`}
          onClick={onRetry}
          data-testid="cycle-failed-assignment-retry"
        >
          <RotateCcwIcon className="size-3 shrink-0" />
          Retry
        </Button>
        <Button
          type="button"
          size={isTouch ? 'icon-touch' : 'icon-sm'}
          variant="ghost"
          aria-label={`Dismiss the failed assignment for ${failedWrite.volunteerName}`}
          onClick={onDismiss}
          data-testid="cycle-failed-assignment-dismiss"
        >
          <XIcon className="size-3" />
        </Button>
      </span>
      {/* Durable text, not just the tooltip above — a leader who looks back at
          this cell three minutes later has no hover in flight to catch it. */}
      <span className="truncate text-destructive text-xs">
        {failedWrite.message}
      </span>
    </span>
  );
}

interface RoleFocusButtonProps {
  roleLabel: string;
  shiftId: string;
  roleId: string;
  isFocused: boolean;
  onToggleFocus: () => void;
}

/**
 * The cell's role label, doubling as the rail's focus control. Focusing is its
 * own affordance because the only way to make the rail rank for a shift×role
 * used to be opening the picker — the one flow a leader working straight from
 * the rail is trying to avoid.
 */
export function RoleFocusButton({
  roleLabel,
  shiftId,
  roleId,
  isFocused,
  onToggleFocus,
}: RoleFocusButtonProps) {
  const isTouch = useFormControlSize() === 'touch';

  return (
    <Button
      type="button"
      size={isTouch ? 'touch' : 'sm'}
      variant="ghost"
      aria-pressed={isFocused}
      aria-label={
        isFocused
          ? `Showing volunteers for ${roleLabel} — clear to show the whole list`
          : `Show volunteers for ${roleLabel} first`
      }
      data-testid={`cycle-requirement-focus-${shiftId}-${roleId}`}
      onClick={onToggleFocus}
      className={cn(
        '-my-1 -ml-1 h-auto min-w-0 gap-1.5 rounded-md px-1 py-1 font-medium text-foreground text-xs aria-pressed:text-primary',
        isTouch && 'gap-2 py-2 text-sm',
      )}
    >
      <span className="truncate">{roleLabel}</span>
      <LocateFixed className="size-3 shrink-0 text-muted-foreground" />
    </Button>
  );
}
