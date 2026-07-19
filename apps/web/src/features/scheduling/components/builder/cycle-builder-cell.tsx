import { useDroppable } from '@dnd-kit/core';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import type {
  CycleBuilderAssignment,
  CycleBuilderShiftSummary,
} from '../../hooks/use-cycle-builder';
import { AssignmentChip } from './assignment-chip';
import { AssignmentPicker, type PickerVolunteer } from './assignment-picker';
import type { SuggestedVolunteer } from './suggestion-list';
import { Button } from '@/components/ui/button';
import { useFormControlSize } from '@/components/ui/form-control-size';
import { cn } from '@/lib/utils';

interface CycleBuilderCellProps {
  shift: CycleBuilderShiftSummary;
  roleId: string;
  roleLabel: string;
  requiredCount: number;
  assignments: CycleBuilderAssignment[];
  pickerVolunteers: PickerVolunteer[];
  suggestions: SuggestedVolunteer[];
  needsResponseSuggestions: SuggestedVolunteer[];
  conflictSuggestions: SuggestedVolunteer[];
  slotLabel: string;
  selectedVolunteerId?: string;
  selectedVolunteerName?: string;
  isPublished: boolean;
  onFocus: () => void;
  onSelect: (input: CycleBuilderCellSelectInput) => void;
  onRemove: (assignmentId: string) => void;
}

export interface CycleBuilderCellSelectInput {
  shiftId: string;
  roleId: string;
  volunteerId: string;
  volunteerName?: string;
  assignmentId?: string;
  slotLabel?: string;
  conflictType?: 'double_booked' | 'unavailable';
}

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

function AssignmentButton({
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

export function CycleBuilderCell({
  shift,
  roleId,
  roleLabel,
  requiredCount,
  assignments,
  pickerVolunteers,
  suggestions,
  needsResponseSuggestions,
  conflictSuggestions,
  slotLabel,
  selectedVolunteerId,
  selectedVolunteerName,
  isPublished,
  onFocus,
  onSelect,
  onRemove,
}: CycleBuilderCellProps) {
  const isTouch = useFormControlSize() === 'touch';
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const canAdd = assignments.length < requiredCount;
  const selectedVolunteerIsAssignedToShift = shift.assignments.some(
    (assignment) =>
      assignment.volunteerId === selectedVolunteerId &&
      assignment.status !== 'cancelled' &&
      assignment.status !== 'declined',
  );
  const roleDropTarget = useDroppable({
    id: `cycle-role:${shift.shiftId}:${roleId}`,
    data: { shiftId: shift.shiftId, roleId },
    disabled: !canAdd,
  });
  const selectSuggestion = (suggestion: SuggestedVolunteer) => {
    onFocus();
    onSelect({
      shiftId: shift.shiftId,
      roleId,
      volunteerId: suggestion.id,
      volunteerName: suggestion.name,
      slotLabel,
      conflictType: suggestion.conflictType,
    });
  };

  return (
    <div
      ref={roleDropTarget.setNodeRef}
      className={cn(
        'min-w-0 rounded-md border border-border/70 bg-background/40 p-2 transition-colors',
        roleDropTarget.isOver && 'border-primary bg-primary/5',
      )}
      data-drop-target={canAdd ? 'append' : undefined}
      data-testid={`cycle-requirement-${shift.shiftId}-${roleId}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium text-xs">{roleLabel}</span>
        <span className="shrink-0 text-muted-foreground text-xs">
          {assignments.length}/{requiredCount}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {assignments.map((assignment) => (
          <AssignmentButton
            key={assignment.id}
            assignment={assignment}
            shiftId={shift.shiftId}
            roleId={roleId}
            isPublished={isPublished}
            onFocus={onFocus}
            pickerVolunteers={pickerVolunteers}
            onRemove={() => onRemove(assignment.id)}
            onSelect={(volunteerId) =>
              onSelect({
                shiftId: shift.shiftId,
                roleId,
                volunteerId,
                assignmentId: assignment.id,
              })
            }
          />
        ))}

        {canAdd &&
        selectedVolunteerId &&
        !selectedVolunteerIsAssignedToShift ? (
          <Button
            type="button"
            size={isTouch ? 'touch' : 'sm'}
            variant="ghost"
            className={cn(
              'h-7 rounded-full border border-primary/60 border-dashed bg-primary/5 px-2 text-foreground text-xs',
              isTouch && 'h-11 px-3 text-sm',
            )}
            onClick={() => {
              onFocus();
              onSelect({
                shiftId: shift.shiftId,
                roleId,
                volunteerId: selectedVolunteerId,
              });
            }}
          >
            Assign {selectedVolunteerName ?? 'selected volunteer'}
          </Button>
        ) : null}

        {canAdd &&
        (!selectedVolunteerId || selectedVolunteerIsAssignedToShift) ? (
          <AssignmentPicker
            open={addPickerOpen}
            onOpenChange={(open) => {
              setAddPickerOpen(open);
              if (open) onFocus();
            }}
            trigger={
              <Button
                type="button"
                size={isTouch ? 'touch' : 'sm'}
                variant="ghost"
                className={cn(
                  'h-7 rounded-full border border-dashed px-2 text-muted-foreground',
                  isTouch && 'h-11 px-3 text-sm',
                )}
              >
                <PlusIcon className="size-3" />
                Add
              </Button>
            }
            volunteers={pickerVolunteers}
            suggestions={{
              safe: suggestions,
              needsResponse: needsResponseSuggestions,
              conflicts: conflictSuggestions,
            }}
            onSelectSuggestion={selectSuggestion}
            onSelect={(volunteerId) =>
              onSelect({ shiftId: shift.shiftId, roleId, volunteerId })
            }
          />
        ) : null}
      </div>
    </div>
  );
}
