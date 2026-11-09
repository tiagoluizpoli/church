import { m } from '@church/i18n/messages';
import { isAxiosError } from 'axios';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import type { CycleBuilderCellSelectInput } from '../components/builder/board/cycle-builder-cell';
import type { FailedAssignmentWrite } from '../components/builder/board/cycle-builder-cell-parts';
import type { CycleBuilderData } from './use-cycle-builder';
import { isOptimisticAssignmentId } from './use-cycle-builder.optimistic';
import { randomId } from '@/shared/utils/id';
import type { AssigneeMembership } from '@/utils/format-assignee-role-label';

interface CreateAssignmentBody {
  volunteerId: string;
  shiftRequirementId: string;
}

export interface CreateAssignmentInput {
  shiftId: string;
  body: CreateAssignmentBody;
}

interface ReassignAssignmentBody {
  volunteerId: string;
}

export interface ReassignAssignmentInput {
  assignmentId: string;
  body: ReassignAssignmentBody;
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

interface UnavailableState {
  input: CycleBuilderCellSelectInput;
  volunteerName: string;
  volunteerMembership?: AssigneeMembership;
}

interface UseCycleBuilderActionsInput extends CycleBuilderMutations {
  data: CycleBuilderData;
  onAssignmentApplied?: () => void;
}

interface FailedWriteEntry {
  failedWrite: FailedAssignmentWrite;
  input: CycleBuilderCellSelectInput;
}

interface ApplyAssignmentInput {
  input: CycleBuilderCellSelectInput;
  mode?: 'create' | 'reassign';
}

interface RemoveAssignmentInput {
  assignmentId: string;
  volunteerName: string;
}

interface ReportInput {
  message: string;
  tone: 'success' | 'error';
}

interface ErrorMessageInput {
  error: unknown;
  fallback: string;
}

const refusalSchema = z.object({ message: z.string().min(1) });

function errorMessage({ error, fallback }: ErrorMessageInput): string {
  const refusal = refusalSchema.safeParse(
    isAxiosError<unknown>(error) ? error.response?.data : undefined,
  );
  if (refusal.success) return refusal.data.message;
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useCycleBuilderActions({
  data,
  createAssignment,
  deleteAssignment,
  reassignAssignment,
  onAssignmentApplied,
}: UseCycleBuilderActionsInput) {
  const [unavailable, setUnavailable] = useState<UnavailableState | null>(null);
  const [failedWrites, setFailedWrites] = useState<FailedWriteEntry[]>([]);
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
      for (const eventTimeBlock of event.eventTimeBlocks) {
        for (const shift of eventTimeBlock.shifts) {
          const eligible = shift.eligibleVolunteers.find(
            (volunteer) => volunteer.volunteerId === input.volunteerId,
          );
          if (eligible) return eligible.volunteerName;
        }
      }
    }
    return input.volunteerId;
  };

  // Mirrors `volunteerNameFor`'s lookup order — the assignment already on the
  // board first, then the shift's own eligible-volunteer rows — so the
  // confirmation dialog's "Leader" badge reflects the same person
  // `volunteerNameFor` just named (FR-013).
  const volunteerMembershipFor = (
    input: CycleBuilderCellSelectInput,
  ): AssigneeMembership | undefined => {
    const assigned = data.assignments.find(
      (assignment) => assignment.volunteerId === input.volunteerId,
    )?.membership;
    if (assigned) return assigned;
    for (const event of data.events) {
      for (const eventTimeBlock of event.eventTimeBlocks) {
        for (const shift of eventTimeBlock.shifts) {
          const eligible = shift.eligibleVolunteers.find(
            (volunteer) => volunteer.volunteerId === input.volunteerId,
          );
          if (eligible) {
            return {
              ministryAccessLevel: eligible.ministryAccessLevel,
            };
          }
        }
      }
    }
    return undefined;
  };

  const applyAssignment = async ({
    input,
    mode,
  }: ApplyAssignmentInput): Promise<boolean> => {
    const volunteerName = volunteerNameFor(input);
    const eventTimeBlockLabel = input.eventTimeBlockLabel ?? 'this shift';
    const shouldCreate = mode === 'create' || (!mode && !input.assignmentId);
    try {
      if (!shouldCreate && input.assignmentId) {
        await reassignAssignment.mutateAsync({
          assignmentId: input.assignmentId,
          body: { volunteerId: input.volunteerId },
        });
      } else {
        await createAssignment.mutateAsync({
          shiftId: input.shiftId,
          body: {
            volunteerId: input.volunteerId,
            shiftRequirementId: input.shiftRequirementId,
          },
        });
      }
      setFailedWrites((current) =>
        current.filter(
          (record) =>
            record.input.shiftRequirementId !== input.shiftRequirementId ||
            record.input.volunteerId !== input.volunteerId,
        ),
      );
      onAssignmentApplied?.();
      report({
        message: `Assigned ${volunteerName} to ${eventTimeBlockLabel}`,
        tone: 'success',
      });
      return true;
    } catch (error) {
      const message = errorMessage({
        error,
        fallback: m.common_assignment_failed(),
      });
      setFailedWrites((current) => [
        ...current,
        {
          failedWrite: {
            failedWriteId: randomId(),
            shiftId: input.shiftId,
            shiftRequirementId: input.shiftRequirementId,
            roleId: input.roleId,
            volunteerId: input.volunteerId,
            volunteerName,
            message,
          },
          input,
        },
      ]);
      report({
        message: `Could not assign ${volunteerName} to ${eventTimeBlockLabel}: ${message}`,
        tone: 'error',
      });
      return false;
    }
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

    if (input.unavailable) {
      setUnavailable({
        input,
        volunteerName: volunteerNameFor(input),
        volunteerMembership: volunteerMembershipFor(input),
      });
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
    void applyAssignment({ input: record.input });
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

  const confirmUnavailable = () => {
    const confirmed = unavailable;
    setUnavailable(null);
    if (confirmed) void applyAssignment({ input: confirmed.input });
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
        message: `Could not remove ${volunteerName}: ${errorMessage({ error, fallback: m.common_removal_failed() })}`,
        tone: 'error',
      });
      return false;
    }
  };

  return {
    announcement,
    boardFailedWrites,
    confirmUnavailable,
    dismissFailedWrite,
    failedWrites,
    handleSelectAssignment,
    isSaving,
    unavailable,
    removeAssignment,
    retryFailedWrite,
    setUnavailable,
  };
}
