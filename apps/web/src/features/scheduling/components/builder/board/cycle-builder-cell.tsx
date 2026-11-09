import { m } from '@church/i18n/messages';
import { compareInstants, now, parseInstant } from '@church/time';
import { useDndContext, useDroppable } from '@dnd-kit/core';
import { PlusIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  type CycleBuilderAssignment,
  type CycleBuilderShiftSummary,
  isActiveAssignment,
} from '../../../hooks/use-cycle-builder';
import type {
  PickerVolunteer,
  SuggestedVolunteer,
} from '../../../utils/builder/cycle-builder-candidate.types';
import { timeLabel } from '../../../utils/builder/cycle-builder-date.utils';
import {
  draggedAssignment,
  draggedVolunteerId,
} from '../../../utils/builder/cycle-builder-dnd.utils';
import {
  isAssignableFit,
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
import { useTimezone } from '@/shared/hooks/use-timezone';

export interface MoveAssignmentInput {
  assignmentId: string;
  shiftRequirementId: string;
}

interface CycleBuilderCellProps {
  shift: CycleBuilderShiftSummary;
  shiftRequirementId: string;
  roleId: string;
  roleLabel: string;
  displayRoleLabel?: string;
  peopleNeeded: number;
  assignments: CycleBuilderAssignment[];
  pickerVolunteers: PickerVolunteer[];
  suggestions: SuggestedVolunteer[];
  needsResponseSuggestions: SuggestedVolunteer[];
  eventTimeBlockLabel: string;
  selectedVolunteerId?: string;
  selectedVolunteerName?: string;
  isPublished: boolean;
  isEditable?: boolean;
  /** True while the rail is ranking people for this shift×role. */
  isFocused?: boolean;
  /** Writes for this shift×role that the server rejected, kept on the board. */
  failedWrites?: FailedAssignmentWrite[];
  onFocus: () => void;
  onToggleFocus: () => void;
  onSelect: (input: CycleBuilderCellSelectInput) => void;
  onRemove: (assignmentId: string) => void;
  onMove?: (input: MoveAssignmentInput) => void;
  onRetryFailedWrite?: (failedWriteId: string) => void;
  onDismissFailedWrite?: (failedWriteId: string) => void;
}

/**
 * Why a pick costs what it costs, per tier. `none` never renders an action, so
 * it needs no copy. This is spoken on the button's accessible name and shown in
 * a real tooltip — it used to be a native `title`, which is the only place the
 * board explained availability and is reachable by neither keyboard nor screen
 * reader (B-3).
 */
const fitExplanations = (): Record<
  ShiftRoleFit['tier'],
  string | undefined
> => ({
  ready: undefined,
  unavailable: undefined,
  unqualified: m.builder_ui_unqualified(),
  none: undefined,
});

interface CycleBuilderCellCommitInput {
  volunteerId: string;
  volunteerName?: string;
  assignmentId?: string;
}

export interface CycleBuilderCellSelectInput {
  shiftId: string;
  shiftRequirementId: string;
  roleId: string;
  volunteerId: string;
  volunteerName?: string;
  assignmentId?: string;
  eventTimeBlockLabel?: string;
  unavailable?: boolean;
}

export function CycleBuilderCell({
  shift,
  shiftRequirementId,
  roleId,
  roleLabel,
  displayRoleLabel,
  peopleNeeded,
  assignments,
  pickerVolunteers,
  suggestions,
  needsResponseSuggestions,
  eventTimeBlockLabel,
  selectedVolunteerId,
  selectedVolunteerName,
  isPublished,
  isEditable: editable = true,
  isFocused,
  failedWrites,
  onFocus,
  onToggleFocus,
  onSelect,
  onRemove,
  onMove,
  onRetryFailedWrite,
  onDismissFailedWrite,
}: CycleBuilderCellProps) {
  const [currentInstant, setCurrentInstant] = useState(now);
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentInstant(now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const isStarted =
    compareInstants({
      left: parseInstant({ value: shift.startTime }),
      right: currentInstant,
    }) <= 0;
  const isEditable = editable && !isStarted;
  const isTouch = useFormControlSize() === 'touch';
  const { churchTimezone } = useTimezone();
  const shiftLabel =
    shift.label ??
    `${eventTimeBlockLabel} · ${timeLabel({ instant: shift.startTime, timeZone: churchTimezone })} – ${timeLabel({ instant: shift.endTime, timeZone: churchTimezone })}`;
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const canAdd = assignments.length < peopleNeeded;
  const hasRoleHolder = shift.eligibleVolunteers.some((volunteer) =>
    volunteer.qualifiedRoleIds.includes(roleId),
  );
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
  const movingAssignment = draggedAssignment({ active });
  const validMoveTarget = Boolean(
    movingAssignment &&
      movingAssignment.shiftId === shift.shiftId &&
      movingAssignment.roleId === roleId &&
      movingAssignment.shiftRequirementId !== shiftRequirementId,
  );
  const draggedFit = draggedId
    ? volunteerFitForShiftRole({ shift, roleId, volunteerId: draggedId })
    : null;
  const roleDropTarget = useDroppable({
    id: `cycle-requirement:${shiftRequirementId}`,
    data: { shiftId: shift.shiftId, shiftRequirementId },
    disabled:
      !isEditable ||
      (movingAssignment ? !validMoveTarget : !canAdd) ||
      Boolean(draggedFit && !isAssignableFit({ fit: draggedFit })),
  });
  // Reverse highlight: selecting someone in the rail paints the board with
  // where they actually fit. Before this every under-filled cell offered an
  // identical "Assign X", which said nothing — the board looked the same for a
  // qualified, available volunteer and for one who fits nowhere.
  let selectedCandidateFit: ShiftRoleFit = { tier: 'none' };
  if (
    isEditable &&
    canAdd &&
    selectedVolunteerId &&
    !selectedVolunteerIsAssignedToShift
  ) {
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
  // Each assignment gesture carries the same availability state.
  const commit = (input: CycleBuilderCellCommitInput) => {
    onFocus();
    onSelect({
      shiftId: shift.shiftId,
      shiftRequirementId,
      roleId,
      volunteerId: input.volunteerId,
      volunteerName: input.volunteerName,
      assignmentId: input.assignmentId,
      eventTimeBlockLabel,
      unavailable:
        volunteerFitForShiftRole({
          shift,
          roleId,
          volunteerId: input.volunteerId,
        }).tier === 'unavailable',
    });
  };
  const selectSuggestion = (suggestion: SuggestedVolunteer) =>
    commit({ volunteerId: suggestion.id, volunteerName: suggestion.name });

  // The "Assign X" pill, plus the explanation of what that pick will cost. The
  // explanation rides the accessible name as well as the tooltip: a button
  // whose consequence is only visible on hover tells a keyboard user nothing.
  const fitExplanation =
    selectedFit.tier === 'unavailable'
      ? m.builder_unavailable_confirmation_required()
      : fitExplanations()[selectedFit.tier];
  const assignLabel = m.builder_ui_assign_name({
    name: selectedVolunteerName ?? m.builder_ui_selected_volunteer(),
  });
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
          selectedFit.tier === 'unavailable' &&
            'border-yellow-700 border-dashed text-yellow-700 dark:border-yellow-400 dark:text-yellow-300',
          selectedFit.tier === 'unqualified' &&
            'border-yellow-700 border-dotted text-yellow-700 dark:border-yellow-400 dark:text-yellow-300',
          isTouch && 'h-11 px-3 text-sm',
        )}
        aria-label={
          fitExplanation ? `${assignLabel} — ${fitExplanation}` : undefined
        }
        data-fit-tier={selectedFit.tier}
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
        selectedFit.tier === 'ready' && 'ring-2 ring-primary',
        selectedFit.tier === 'unavailable' &&
          'outline-dashed outline-2 outline-yellow-700 dark:outline-yellow-400',
        selectedFit.tier === 'unqualified' &&
          'outline-dotted outline-2 outline-yellow-700 dark:outline-yellow-400',
        isFocused && 'border-primary/70 bg-primary/5',
        roleDropTarget.isOver && 'border-primary bg-primary/5',
      )}
      data-selected-fit={selectedFit.tier}
      data-drop-target={
        isEditable && (movingAssignment ? validMoveTarget : canAdd)
          ? 'append'
          : undefined
      }
      data-testid={`cycle-requirement-${shiftRequirementId}`}
    >
      <div className="flex items-center justify-between gap-2">
        <RoleFocusButton
          roleLabel={displayRoleLabel ?? roleLabel}
          shiftRequirementId={shiftRequirementId}
          isFocused={isFocused ?? false}
          onToggleFocus={onToggleFocus}
        />
        <span className="shrink-0 text-muted-foreground text-xs">
          {assignments.length}/{peopleNeeded}
        </span>
      </div>

      {isStarted ? (
        <p className="mt-2 text-muted-foreground text-xs">
          {m.builder_shift_started()}
        </p>
      ) : null}
      {!hasRoleHolder ? (
        <p className="mt-2 text-muted-foreground text-xs">
          <span>
            {m.builder_no_role_holders({ role: displayRoleLabel ?? roleLabel })}
          </span>{' '}
          <a
            className="underline underline-offset-2"
            href="/people"
            target="_blank"
            rel="noopener noreferrer"
          >
            {m.nav_people()}
          </a>
          {' · '}
          <a
            className="underline underline-offset-2"
            href="/invitations"
            target="_blank"
            rel="noopener noreferrer"
          >
            {m.nav_invitations()}
          </a>
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {assignments.map((assignment) => (
          <AssignmentButton
            key={assignment.id}
            assignment={assignment}
            shiftId={shift.shiftId}
            shiftLabel={shiftLabel}
            shiftRequirementId={shiftRequirementId}
            roleId={roleId}
            isPublished={isPublished}
            isUnavailable={shift.eligibleVolunteers.some(
              (volunteer) =>
                volunteer.volunteerId === assignment.volunteerId &&
                volunteer.answerState === 'unavailable',
            )}
            isEditable={isEditable}
            onFocus={onFocus}
            pickerVolunteers={pickerVolunteers}
            onRemove={() => onRemove(assignment.id)}
            moveTargets={shift.requirements.filter(
              (requirement) =>
                requirement.roleId === roleId &&
                requirement.id !== shiftRequirementId,
            )}
            onMove={(targetId) =>
              onMove?.({
                assignmentId: assignment.id,
                shiftRequirementId: targetId,
              })
            }
            onSelect={(input: AssignmentButtonSelectInput) =>
              commit({ ...input, assignmentId: assignment.id })
            }
          />
        ))}

        {failedWrites?.map((failedWrite) => (
          <FailedAssignmentChip
            key={failedWrite.failedWriteId}
            failedWrite={failedWrite}
            isEditable={isEditable}
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

        {isEditable && canAdd ? (
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
                {m.builder_ui_add()}
              </Button>
            }
            volunteers={pickerVolunteers}
            suggestions={{
              safe: suggestions,
              needsResponse: needsResponseSuggestions,
            }}
            onSelectSuggestion={selectSuggestion}
            onSelect={(volunteerId) => commit({ volunteerId })}
          />
        ) : null}
      </div>
    </div>
  );
}
