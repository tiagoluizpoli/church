import { useDndContext, useDroppable } from '@dnd-kit/core';
import { PlusIcon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import {
  type CycleBuilderAssignment,
  type CycleBuilderShiftSummary,
  isActiveAssignment,
} from '../../hooks/use-cycle-builder';
import { AssignmentPicker, type PickerVolunteer } from './assignment-picker';
import { AssignmentButton, RoleFocusButton } from './cycle-builder-cell-parts';
import {
  draggedVolunteerId,
  type ShiftRoleFit,
  volunteerFitForShiftRole,
} from './cycle-builder-matrix.utils';
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
  /** True while the rail is ranking people for this shift×role. */
  isFocused?: boolean;
  onFocus: () => void;
  onToggleFocus: () => void;
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
  isFocused,
  onFocus,
  onToggleFocus,
  onSelect,
  onRemove,
}: CycleBuilderCellProps) {
  const isTouch = useFormControlSize() === 'touch';
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const canAdd = assignments.length < requiredCount;
  const selectedVolunteerIsAssignedToShift = shift.assignments.some(
    (assignment) =>
      assignment.volunteerId === selectedVolunteerId &&
      isActiveAssignment({ status: assignment.status }),
  );
  // A drag in flight is tiered exactly like a selection: a cell that would
  // offer nothing to this person must not accept them by drop either, or the
  // board's highlight and its drop targets tell the leader different stories.
  const { active } = useDndContext();
  const draggedId = draggedVolunteerId({ active });
  const draggedFit = draggedId
    ? volunteerFitForShiftRole({ shift, roleId, volunteerId: draggedId })
    : null;
  const roleDropTarget = useDroppable({
    id: `cycle-role:${shift.shiftId}:${roleId}`,
    data: { shiftId: shift.shiftId, roleId },
    disabled: !canAdd || draggedFit?.tier === 'none',
  });
  // Reverse highlight: selecting someone in the rail paints the board with
  // where they actually fit. Before this every under-filled cell offered an
  // identical "Assign X", which said nothing — the board looked the same for a
  // qualified, available volunteer and for one who fits nowhere.
  const selectedFit: ShiftRoleFit =
    canAdd && selectedVolunteerId && !selectedVolunteerIsAssignedToShift
      ? volunteerFitForShiftRole({
          shift,
          roleId,
          volunteerId: selectedVolunteerId,
        })
      : { tier: 'none' };
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
        // Ring rather than border, so the selection tier and the focus tint
        // below can both be legible on the same cell.
        selectedFit.tier === 'ready' && 'ring-1 ring-primary/50',
        selectedFit.tier === 'override' && 'ring-1 ring-muted-foreground/30',
        isFocused && 'border-primary/70 bg-primary/5',
        roleDropTarget.isOver && 'border-primary bg-primary/5',
      )}
      data-selected-fit={selectedFit.tier}
      data-drop-target={canAdd ? 'append' : undefined}
      data-testid={`cycle-requirement-${shift.shiftId}-${roleId}`}
    >
      <div className="flex items-center justify-between gap-2">
        <RoleFocusButton
          roleLabel={roleLabel}
          shiftId={shift.shiftId}
          roleId={roleId}
          isFocused={isFocused ?? false}
          onToggleFocus={onToggleFocus}
        />
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

        {selectedVolunteerId && selectedFit.tier !== 'none' ? (
          <Button
            type="button"
            size={isTouch ? 'touch' : 'sm'}
            variant="ghost"
            className={cn(
              'h-7 rounded-full border border-dashed px-2 text-xs',
              selectedFit.tier === 'ready'
                ? 'border-primary/60 bg-primary/5 text-foreground'
                : 'border-muted-foreground/40 text-muted-foreground',
              isTouch && 'h-11 px-3 text-sm',
            )}
            title={
              selectedFit.tier === 'override'
                ? 'Not available for this shift — assigning is an override'
                : undefined
            }
            onClick={() => {
              onFocus();
              onSelect({
                shiftId: shift.shiftId,
                roleId,
                volunteerId: selectedVolunteerId,
                slotLabel,
                // FR-016: an override must reach the reason dialog. The
                // conflict rides on the tier precisely so this cannot be
                // forgotten — `CycleBuilder` opens `OverrideDialog` on it.
                conflictType:
                  selectedFit.tier === 'override'
                    ? selectedFit.conflictType
                    : undefined,
              });
            }}
          >
            {selectedFit.tier === 'override' ? (
              <TriangleAlertIcon className="size-3 shrink-0" />
            ) : null}
            Assign {selectedVolunteerName ?? 'selected volunteer'}
          </Button>
        ) : null}

        {canAdd && selectedFit.tier === 'none' ? (
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
