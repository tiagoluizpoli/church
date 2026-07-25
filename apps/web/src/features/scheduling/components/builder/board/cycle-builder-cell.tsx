import { useDndContext, useDroppable } from '@dnd-kit/core';
import { PlusIcon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import {
  type CycleBuilderAssignment,
  type CycleBuilderShiftSummary,
  isActiveAssignment,
} from '../../../hooks/use-cycle-builder';
import type {
  PickerVolunteer,
  SuggestedVolunteer,
} from '../../../utils/builder/cycle-builder-candidate.types';
import { draggedVolunteerId } from '../../../utils/builder/cycle-builder-dnd.utils';
import {
  type AssignmentOverrideKind,
  isAssignableFit,
  overrideKindForFit,
  type ShiftRoleFit,
  volunteerFitForShiftRole,
} from '../../../utils/builder/cycle-builder-fit.utils';
import { AssignmentPicker } from '../assignment/assignment-picker';
import {
  AssignmentButton,
  type AssignmentButtonSelectInput,
  FailedAssignmentChip,
  type FailedAssignmentWrite,
  RoleFocusButton,
} from './cycle-builder-cell-parts';
import { Button } from '@/components/ui/button';
import { useFormControlSize } from '@/components/ui/form-control-size';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
  /** Writes for this shift×role that the server rejected, kept on the board. */
  failedWrites?: FailedAssignmentWrite[];
  onFocus: () => void;
  onToggleFocus: () => void;
  onSelect: (input: CycleBuilderCellSelectInput) => void;
  onRemove: (assignmentId: string) => void;
  onRetryFailedWrite?: (failedWriteId: string) => void;
  onDismissFailedWrite?: (failedWriteId: string) => void;
}

/**
 * Why a pick costs what it costs, per tier. `none` never renders an action, so
 * it needs no copy. This is spoken on the button's accessible name and shown in
 * a real tooltip — it used to be a native `title`, which is the only place the
 * board explained an override and is reachable by neither keyboard nor screen
 * reader (B-3).
 */
const FIT_EXPLANATION: Record<ShiftRoleFit['tier'], string | undefined> = {
  ready: undefined,
  override: 'Not available for this shift — assigning is an override',
  unqualified: 'Not qualified for this role — assigning needs a reason',
  none: undefined,
};

interface CycleBuilderCellCommitInput {
  volunteerId: string;
  volunteerName?: string;
  assignmentId?: string;
}

export interface CycleBuilderCellSelectInput {
  shiftId: string;
  roleId: string;
  volunteerId: string;
  volunteerName?: string;
  assignmentId?: string;
  slotLabel?: string;
  /** Names the role in override copy, so it never has to say "this role". */
  roleLabel?: string;
  /**
   * What this write has to justify, or `undefined` when it needs no reason.
   * Always `overrideKindForFit()` of the shared predicate — no gesture decides
   * for itself whether a pick is risky (B-2).
   */
  conflictType?: AssignmentOverrideKind;
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
  failedWrites,
  onFocus,
  onToggleFocus,
  onSelect,
  onRemove,
  onRetryFailedWrite,
  onDismissFailedWrite,
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
    disabled:
      !canAdd || Boolean(draggedFit && !isAssignableFit({ fit: draggedFit })),
  });
  // Reverse highlight: selecting someone in the rail paints the board with
  // where they actually fit. Before this every under-filled cell offered an
  // identical "Assign X", which said nothing — the board looked the same for a
  // qualified, available volunteer and for one who fits nowhere.
  let selectedCandidateFit: ShiftRoleFit = { tier: 'none' };
  if (canAdd && selectedVolunteerId && !selectedVolunteerIsAssignedToShift) {
    selectedCandidateFit = volunteerFitForShiftRole({
      shift,
      roleId,
      volunteerId: selectedVolunteerId,
    });
  }
  const selectedFit: ShiftRoleFit = isAssignableFit({
    fit: selectedCandidateFit,
  })
    ? selectedCandidateFit
    : { tier: 'none' };
  // Every commit out of this cell — the picker's suggestions, the picker's
  // plain list, the "Assign X" button — asks the same predicate what it owes.
  // The picker's list used to send no `conflictType` at all, so an unavailable
  // person chosen there committed with no reason while the identical person
  // chosen from the rail was stopped (B-2).
  const commit = (input: CycleBuilderCellCommitInput) => {
    onFocus();
    onSelect({
      shiftId: shift.shiftId,
      roleId,
      volunteerId: input.volunteerId,
      volunteerName: input.volunteerName,
      assignmentId: input.assignmentId,
      slotLabel,
      roleLabel,
      conflictType: overrideKindForFit({
        fit: volunteerFitForShiftRole({
          shift,
          roleId,
          volunteerId: input.volunteerId,
        }),
      }),
    });
  };
  const selectSuggestion = (suggestion: SuggestedVolunteer) =>
    commit({ volunteerId: suggestion.id, volunteerName: suggestion.name });

  // The "Assign X" pill, plus the explanation of what that pick will cost. The
  // explanation rides the accessible name as well as the tooltip: a button
  // whose consequence is only visible on hover tells a keyboard user nothing.
  const fitExplanation = FIT_EXPLANATION[selectedFit.tier];
  const assignLabel = `Assign ${selectedVolunteerName ?? 'selected volunteer'}`;
  const assignButton =
    selectedVolunteerId && selectedFit.tier !== 'none' ? (
      <Button
        type="button"
        size={isTouch ? 'touch' : 'sm'}
        variant="ghost"
        className={cn(
          'h-7 rounded-full border px-2 text-xs',
          selectedFit.tier === 'ready' &&
            'border-primary bg-primary/10 text-foreground',
          // Dashed = needs an availability override, dotted = needs a
          // qualification override — same amber, different border style, so
          // the two risk types read apart without hovering (B-9).
          selectedFit.tier === 'override' &&
            'border-yellow-700 border-dashed text-yellow-700 dark:border-yellow-400 dark:text-yellow-300',
          selectedFit.tier === 'unqualified' &&
            'border-yellow-700 border-dotted text-yellow-700 dark:border-yellow-400 dark:text-yellow-300',
          isTouch && 'h-11 px-3 text-sm',
        )}
        aria-label={
          fitExplanation ? `${assignLabel} — ${fitExplanation}` : undefined
        }
        data-fit-tier={selectedFit.tier}
        // FR-016: an override must reach the reason dialog, and `commit`
        // is the only thing here that decides what a pick owes.
        onClick={() => commit({ volunteerId: selectedVolunteerId })}
      >
        {selectedFit.tier === 'ready' ? null : (
          <TriangleAlertIcon className="size-3 shrink-0" />
        )}
        {assignLabel}
      </Button>
    ) : null;

  return (
    <div
      ref={roleDropTarget.setNodeRef}
      className={cn(
        'min-w-0 rounded-md border border-border/70 bg-background/40 p-2 transition-colors',
        // Ring/outline rather than border, so the selection tier and the focus
        // tint below can both be legible on the same cell. Full token opacity
        // at 2px, differentiated by *shape* rather than tint: the old
        // `ring-1 ring-primary/50` / `ring-1 ring-muted-foreground/30` pair
        // computed under the 3:1 floor for a non-text boundary AND drew the
        // dangerous tier fainter than the safe one, while this ring is the only
        // way to find where a selected person fits across a scrolling board.
        // `override` and `unqualified` share the outline color (both mean
        // "needs a reason") but not the style — dashed vs. dotted — so a
        // leader scanning the board doesn't have to hover to tell an
        // availability override from a qualification one (B-9).
        selectedFit.tier === 'ready' && 'ring-2 ring-primary',
        selectedFit.tier === 'override' &&
          'outline-dashed outline-2 outline-yellow-700 dark:outline-yellow-400',
        selectedFit.tier === 'unqualified' &&
          'outline-dotted outline-2 outline-yellow-700 dark:outline-yellow-400',
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
            onSelect={(input: AssignmentButtonSelectInput) =>
              commit({ ...input, assignmentId: assignment.id })
            }
          />
        ))}

        {failedWrites?.map((failedWrite) => (
          <FailedAssignmentChip
            key={failedWrite.failedWriteId}
            failedWrite={failedWrite}
            onRetry={() => onRetryFailedWrite?.(failedWrite.failedWriteId)}
            onDismiss={() => onDismissFailedWrite?.(failedWrite.failedWriteId)}
          />
        ))}

        {assignButton && fitExplanation ? (
          <Tooltip>
            <TooltipTrigger render={assignButton} />
            <TooltipContent>{fitExplanation}</TooltipContent>
          </Tooltip>
        ) : (
          assignButton
        )}

        {canAdd ? (
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
            onSelect={(volunteerId) => commit({ volunteerId })}
          />
        ) : null}
      </div>
    </div>
  );
}
