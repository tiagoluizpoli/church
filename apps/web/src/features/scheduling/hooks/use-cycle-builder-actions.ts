import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { CycleBuilderCellSelectInput } from '../components/builder/board/cycle-builder-cell';
import type { FailedAssignmentWrite } from '../components/builder/board/cycle-builder-cell-parts';
import {
  overrideKindForFit,
  volunteerFitForShiftRole,
} from '../utils/builder/cycle-builder-fit.utils';
import { findShiftById } from '../utils/builder/cycle-builder-shift-lookup.utils';
import {
  type CycleBuilderAssignment,
  type CycleBuilderData,
  isActiveAssignment,
} from './use-cycle-builder';
import { isOptimisticAssignmentId } from './use-cycle-builder.optimistic';
import { randomId } from '@/shared/utils/id';

export interface CreateAssignmentInput {
  shiftId: string;
  body: {
    volunteerId: string;
    roleId: string;
    override?: { reason: string };
  };
}

export interface ReassignAssignmentInput {
  assignmentId: string;
  body: {
    volunteerId: string;
    reason: string;
  };
}

export interface CycleBuilderMutations {
  createAssignment: {
    isPending: boolean;
    mutateAsync: (input: CreateAssignmentInput) => Promise<unknown>;
  };
  deleteAssignment: {
    isPending: boolean;
    mutateAsync: (assignmentId: string) => Promise<unknown>;
  };
  reassignAssignment: {
    isPending: boolean;
    mutateAsync: (input: ReassignAssignmentInput) => Promise<unknown>;
  };
}

export interface CollisionState {
  input: CycleBuilderCellSelectInput;
  source: CycleBuilderAssignment;
  target?: CycleBuilderAssignment;
}

export type CollisionAction = 'move' | 'both' | 'swap';

interface OverrideState {
  input: CycleBuilderCellSelectInput;
  volunteerName: string;
  collision?: CollisionState;
  collisionAction?: CollisionAction;
}

interface UseCycleBuilderActionsInput extends CycleBuilderMutations {
  data: CycleBuilderData;
  onAssignmentApplied?: () => void;
}

interface ApplyAssignmentInput {
  input: CycleBuilderCellSelectInput;
  overrideReason?: string;
  mode?: 'create' | 'reassign';
}

interface ApplyCollisionInput {
  action: CollisionAction;
  collision?: CollisionState;
  overrideReason?: string;
}

interface RemoveAssignmentInput {
  assignmentId: string;
  volunteerName: string;
}

interface AssignmentConflictInput {
  assignment: CycleBuilderAssignment;
  data: CycleBuilderData;
  volunteerId: string;
}

interface ReportInput {
  message: string;
  tone: 'success' | 'error';
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function conflictTypeForAssignment({
  assignment,
  data,
  volunteerId,
}: AssignmentConflictInput) {
  if (!assignment.shiftId) return undefined;
  const shift = findShiftById({ data, shiftId: assignment.shiftId });
  if (!shift) return undefined;
  return overrideKindForFit({
    fit: volunteerFitForShiftRole({
      shift,
      roleId: assignment.roleId,
      volunteerId,
    }),
  });
}

export function useCycleBuilderActions({
  data,
  createAssignment,
  deleteAssignment,
  reassignAssignment,
  onAssignmentApplied,
}: UseCycleBuilderActionsInput) {
  const [collision, setCollision] = useState<CollisionState | null>(null);
  const [override, setOverride] = useState<OverrideState | null>(null);
  const [failedWrites, setFailedWrites] = useState<
    Array<{
      failedWrite: FailedAssignmentWrite;
      input: CycleBuilderCellSelectInput;
      overrideReason?: string;
    }>
  >([]);
  const [announcement, setAnnouncement] = useState('');
  const isSaving =
    createAssignment.isPending ||
    deleteAssignment.isPending ||
    reassignAssignment.isPending;

  const report = ({ message, tone }: ReportInput) => {
    tone === 'error' ? toast.error(message) : toast.success(message);
    setAnnouncement(message);
  };

  const volunteerNameFor = (input: CycleBuilderCellSelectInput): string => {
    if (input.volunteerName) return input.volunteerName;
    const assigned = data.assignments.find(
      (assignment) => assignment.volunteerId === input.volunteerId,
    )?.volunteerName;
    if (assigned) return assigned;
    for (const event of data.events) {
      for (const slot of event.slots) {
        for (const shift of slot.shifts) {
          const eligible = shift.eligibleVolunteers.find(
            (volunteer) => volunteer.volunteerId === input.volunteerId,
          );
          if (eligible) return eligible.volunteerName;
        }
      }
    }
    return input.volunteerId;
  };

  const applyAssignment = async ({
    input,
    overrideReason,
    mode,
  }: ApplyAssignmentInput): Promise<boolean> => {
    const volunteerName = volunteerNameFor(input);
    const slotLabel = input.slotLabel ?? 'this shift';
    const shouldCreate = mode === 'create' || (!mode && !input.assignmentId);
    try {
      if (!shouldCreate && input.assignmentId) {
        await reassignAssignment.mutateAsync({
          assignmentId: input.assignmentId,
          body: {
            volunteerId: input.volunteerId,
            reason: overrideReason ?? 'Reassigned from the cycle builder',
          },
        });
      } else {
        await createAssignment.mutateAsync({
          shiftId: input.shiftId,
          body: {
            volunteerId: input.volunteerId,
            roleId: input.roleId,
            override: overrideReason ? { reason: overrideReason } : undefined,
          },
        });
      }
      setFailedWrites((current) =>
        current.filter(
          (record) =>
            record.input.shiftId !== input.shiftId ||
            record.input.roleId !== input.roleId ||
            record.input.volunteerId !== input.volunteerId,
        ),
      );
      onAssignmentApplied?.();
      report({
        message: `Assigned ${volunteerName} to ${slotLabel}`,
        tone: 'success',
      });
      return true;
    } catch (error) {
      const message = errorMessage(error, 'Assignment failed');
      setFailedWrites((current) => [
        ...current,
        {
          failedWrite: {
            failedWriteId: randomId(),
            shiftId: input.shiftId,
            roleId: input.roleId,
            volunteerId: input.volunteerId,
            volunteerName,
            message,
          },
          input,
          overrideReason,
        },
      ]);
      report({
        message: `Could not assign ${volunteerName} to ${slotLabel}: ${message}`,
        tone: 'error',
      });
      return false;
    }
  };

  const applyCollision = async ({
    action,
    collision: collisionOverride,
    overrideReason,
  }: ApplyCollisionInput) => {
    const activeCollision = collisionOverride ?? collision;
    if (!activeCollision) return;
    const { input, source, target } = activeCollision;

    if (
      isOptimisticAssignmentId({ assignmentId: source.id }) ||
      (target && isOptimisticAssignmentId({ assignmentId: target.id }))
    ) {
      setCollision(null);
      report({
        message:
          'Please wait for the assignment to finish syncing before moving or swapping it.',
        tone: 'error',
      });
      return;
    }

    const swapConflictType =
      action === 'swap' && target
        ? conflictTypeForAssignment({
            assignment: source,
            data,
            volunteerId: target.volunteerId,
          })
        : undefined;
    const overrideInput =
      swapConflictType && !input.conflictType
        ? { ...input, conflictType: swapConflictType }
        : input;
    if (overrideInput.conflictType && overrideReason === undefined) {
      setCollision(null);
      setOverride({
        input: overrideInput,
        volunteerName: volunteerNameFor(overrideInput),
        collision: activeCollision,
        collisionAction: action,
      });
      return;
    }

    setCollision(null);
    if (action === 'both') {
      await applyAssignment({
        input,
        overrideReason,
        mode: target ? 'create' : undefined,
      });
      return;
    }

    const sourceName = source.volunteerName ?? source.volunteerId;
    const targetName = target?.volunteerName ?? target?.volunteerId ?? '';
    if (!(target && action === 'swap')) {
      const applied = await applyAssignment({ input, overrideReason });
      if (!applied) return;
      try {
        await deleteAssignment.mutateAsync(source.id);
      } catch (error) {
        report({
          message: `${sourceName} was assigned here, but the previous assignment could not be removed — they are now in both: ${errorMessage(error, 'removal failed')}`,
          tone: 'error',
        });
      }
      return;
    }

    try {
      await reassignAssignment.mutateAsync({
        assignmentId: source.id,
        body: {
          volunteerId: target.volunteerId,
          reason: overrideReason ?? 'Swapped in the cycle builder',
        },
      });
    } catch (error) {
      report({
        message: `Could not move ${targetName} into ${sourceName}'s slot. Nothing was changed: ${errorMessage(error, 'reassignment failed')}`,
        tone: 'error',
      });
      return;
    }

    try {
      await reassignAssignment.mutateAsync({
        assignmentId: target.id,
        body: {
          volunteerId: input.volunteerId,
          reason: overrideReason ?? 'Swapped in the cycle builder',
        },
      });
    } catch (error) {
      report({
        message: `Half-applied swap: ${targetName} was moved into ${sourceName}'s slot, but ${sourceName} could not take ${targetName}'s — ${errorMessage(error, 'reassignment failed')}. Reassign ${sourceName} by hand.`,
        tone: 'error',
      });
      return;
    }

    report({
      message: `Swapped ${sourceName} and ${targetName}`,
      tone: 'success',
    });
    onAssignmentApplied?.();
  };

  const handleSelectAssignment = (input: CycleBuilderCellSelectInput) => {
    if (
      input.assignmentId &&
      isOptimisticAssignmentId({ assignmentId: input.assignmentId })
    )
      return;

    const currentAssignment = input.assignmentId
      ? data.assignments.find(
          (assignment) => assignment.id === input.assignmentId,
        )
      : undefined;
    if (currentAssignment?.volunteerId === input.volunteerId) return;

    const source = data.assignments.find(
      (assignment) =>
        assignment.volunteerId === input.volunteerId &&
        assignment.id !== input.assignmentId &&
        !isOptimisticAssignmentId({ assignmentId: assignment.id }) &&
        isActiveAssignment({ status: assignment.status }),
    );
    if (source) {
      setCollision({
        input,
        source,
        target: input.assignmentId
          ? data.assignments.find(
              (assignment) => assignment.id === input.assignmentId,
            )
          : undefined,
      });
      return;
    }
    if (input.conflictType) {
      setOverride({ input, volunteerName: volunteerNameFor(input) });
      return;
    }
    void applyAssignment({ input });
  };

  const retryFailedWrite = (failedWriteId: string) => {
    const record = failedWrites.find(
      (item) => item.failedWrite.failedWriteId === failedWriteId,
    );
    if (!record) return;
    setFailedWrites((current) =>
      current.filter(
        (item) => item.failedWrite.failedWriteId !== failedWriteId,
      ),
    );
    void applyAssignment({
      input: record.input,
      overrideReason: record.overrideReason,
    });
  };

  const dismissFailedWrite = (failedWriteId: string) => {
    setFailedWrites((current) =>
      current.filter(
        (item) => item.failedWrite.failedWriteId !== failedWriteId,
      ),
    );
  };

  const boardFailedWrites = useMemo(
    () => failedWrites.map((record) => record.failedWrite),
    [failedWrites],
  );

  const confirmOverride = (reason: string) => {
    const confirmedOverride = override;
    setOverride(null);
    if (!confirmedOverride) return;
    if (confirmedOverride.collision && confirmedOverride.collisionAction) {
      void applyCollision({
        action: confirmedOverride.collisionAction,
        collision: confirmedOverride.collision,
        overrideReason: reason,
      });
      return;
    }
    void applyAssignment({
      input: confirmedOverride.input,
      overrideReason: reason,
    });
  };

  const removeAssignment = async ({
    assignmentId,
    volunteerName,
  }: RemoveAssignmentInput) => {
    try {
      await deleteAssignment.mutateAsync(assignmentId);
      report({
        message: `Removed ${volunteerName} from this role`,
        tone: 'success',
      });
      return true;
    } catch (error) {
      report({
        message: `Could not remove ${volunteerName}: ${errorMessage(error, 'removal failed')}`,
        tone: 'error',
      });
      return false;
    }
  };

  return {
    announcement,
    boardFailedWrites,
    applyCollision,
    collision,
    confirmOverride,
    dismissFailedWrite,
    failedWrites,
    handleSelectAssignment,
    isSaving,
    override,
    removeAssignment,
    retryFailedWrite,
    setCollision,
    setOverride,
  };
}
