import { useDroppable } from '@dnd-kit/core';
import { LocateFixed } from 'lucide-react';
import { useState } from 'react';
import type { CycleBuilderAssignment } from '../../hooks/use-cycle-builder';
import { AssignmentChip } from './assignment-chip';
import { AssignmentPicker, type PickerVolunteer } from './assignment-picker';
import { Button } from '@/components/ui/button';
import { useFormControlSize } from '@/components/ui/form-control-size';
import { cn } from '@/lib/utils';

interface AssignmentButtonProps {
  assignment: CycleBuilderAssignment;
  shiftId: string;
  roleId: string;
  isPublished: boolean;
  onRemove: () => void;
  onSelect: (volunteerId: string) => void;
  pickerVolunteers: PickerVolunteer[];
  onFocus: () => void;
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
  const replacementTarget = useDroppable({
    id: `cycle-assignment:${assignment.id}`,
    data: { shiftId, roleId, assignmentId: assignment.id },
  });

  return (
    <span
      ref={replacementTarget.setNodeRef}
      className={cn(
        'inline-flex max-w-full rounded-full',
        replacementTarget.isOver && 'ring-1 ring-primary ring-offset-1',
      )}
      data-drop-target="replace"
      data-testid={`cycle-assignment-${assignment.id}`}
    >
      <AssignmentPicker
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) onFocus();
        }}
        trigger={
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
          />
        }
        volunteers={pickerVolunteers}
        hasAssignment
        onSelect={onSelect}
        onRemove={onRemove}
      />
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
