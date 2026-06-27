import { Button } from '@church/ui/components/button';
import { cn } from '@church/ui/lib/utils';
import { useDroppable } from '@dnd-kit/core';
import { useState } from 'react';
import {
  AssignmentChip,
  type ConfirmationStatus,
  type ConflictStatus,
} from './assignment-chip';
import { AssignmentPicker, type PickerVolunteer } from './assignment-picker';
import { type SuggestedVolunteer, SuggestionList } from './suggestion-list';

export interface CellAssignment {
  id: string;
  volunteerId: string;
  volunteerName: string;
  conflictStatus?: ConflictStatus;
  confirmationStatus?: ConfirmationStatus;
}

interface RequirementCellProps {
  slotId: string;
  roleId: string;
  fillIndex: number;
  assignment?: CellAssignment;
  suggestions: SuggestedVolunteer[];
  pickerVolunteers: PickerVolunteer[];
  isReadOnly: boolean;
  isPublished: boolean;
  onAssign: (volunteerId: string) => void;
  onRemove: () => void;
  onOverride?: () => void;
  onSubstitute?: () => void;
}

export function RequirementCell({
  slotId,
  roleId,
  fillIndex,
  assignment,
  suggestions,
  pickerVolunteers,
  isReadOnly,
  isPublished,
  onAssign,
  onRemove,
  onOverride,
  onSubstitute,
}: RequirementCellProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const droppable = useDroppable({
    id: `cell:${slotId}:${roleId}:${fillIndex}`,
    data: { slotId, roleId },
    disabled: isReadOnly,
  });

  const isDeclined = assignment?.confirmationStatus === 'declined';
  const hasConflict = !!assignment?.conflictStatus;

  const containerClass = cn(
    'min-h-12 rounded border border-dashed p-1',
    droppable.isOver && 'border-primary bg-primary/5',
    isReadOnly && 'cursor-not-allowed bg-muted/40',
  );

  // Read-only cells (sub-leader viewing another team) are never interactive.
  if (isReadOnly) {
    return (
      <div
        ref={droppable.setNodeRef}
        className={containerClass}
        data-testid="requirement-cell"
        data-readonly="true"
      >
        {assignment ? (
          <AssignmentChip
            volunteerName={assignment.volunteerName}
            conflictStatus={assignment.conflictStatus}
            confirmationStatus={assignment.confirmationStatus}
            isPublished={isPublished}
          />
        ) : (
          <span className="px-1 text-muted-foreground text-xs">—</span>
        )}
      </div>
    );
  }

  return (
    <div
      ref={droppable.setNodeRef}
      className={containerClass}
      data-testid="requirement-cell"
      data-readonly="false"
    >
      {assignment ? (
        isDeclined ? (
          // Declined → clicking finds a substitute (no inline picker).
          <AssignmentChip
            volunteerName={assignment.volunteerName}
            conflictStatus={assignment.conflictStatus}
            confirmationStatus={assignment.confirmationStatus}
            isPublished={isPublished}
            onClick={onSubstitute}
          />
        ) : (
          <AssignmentPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            trigger={
              <AssignmentChip
                volunteerName={assignment.volunteerName}
                conflictStatus={assignment.conflictStatus}
                confirmationStatus={assignment.confirmationStatus}
                isPublished={isPublished}
              />
            }
            volunteers={pickerVolunteers}
            hasAssignment={true}
            onSelect={onAssign}
            onRemove={onRemove}
          />
        )
      ) : (
        // Empty cell: suggestions (each with its own Accept button) plus a
        // separate picker trigger — avoids nesting interactive elements.
        <div className="space-y-1">
          <SuggestionList suggestions={suggestions} onAssign={onAssign} />
          <AssignmentPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 w-full justify-start px-1 text-muted-foreground text-xs"
              >
                Choose volunteer…
              </Button>
            }
            volunteers={pickerVolunteers}
            hasAssignment={false}
            onSelect={onAssign}
            onRemove={onRemove}
          />
        </div>
      )}

      {hasConflict && onOverride && (
        <button
          type="button"
          className="mt-1 text-orange-600 text-xs underline"
          onClick={onOverride}
        >
          Override
        </button>
      )}
    </div>
  );
}
