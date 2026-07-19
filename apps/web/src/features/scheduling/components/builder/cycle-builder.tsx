import { useState } from 'react';
import { toast } from 'sonner';
import type {
  CycleBuilderAssignment,
  CycleBuilderData,
} from '../../hooks/use-cycle-builder';
import { AuditLogPanel } from './audit-log-panel';
import { CycleBuilderBoard } from './cycle-builder-board';
import type { CycleBuilderCellSelectInput } from './cycle-builder-cell';
import { OverrideDialog } from './override-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMediaQuery } from '@/hooks/use-media-query';

interface CycleBuilderProps {
  data: CycleBuilderData;
  onPublish: (confirmBelowFull: boolean) => void;
  isPublishing: boolean;
  cycleId: string;
  ministryId: string;
  cycleStartDate?: string;
  cycleEndDate?: string;
  createAssignment: CreateAssignmentMutation;
  deleteAssignment: DeleteAssignmentMutation;
  reassignAssignment: ReassignAssignmentMutation;
}

interface CreateAssignmentInput {
  shiftId: string;
  body: CreateAssignmentBody;
}

interface CreateAssignmentBody {
  volunteerId: string;
  roleId: string;
  override?: CreateAssignmentOverride;
}

interface CreateAssignmentOverride {
  reason: string;
}

interface ReassignAssignmentInput {
  assignmentId: string;
  body: ReassignAssignmentBody;
}

interface ReassignAssignmentBody {
  volunteerId: string;
  reason: string;
}

interface CreateAssignmentMutation {
  isPending: boolean;
  mutateAsync: (input: CreateAssignmentInput) => Promise<unknown>;
}

interface DeleteAssignmentMutation {
  isPending: boolean;
  mutateAsync: (assignmentId: string) => Promise<unknown>;
}

interface ReassignAssignmentMutation {
  isPending: boolean;
  mutateAsync: (input: ReassignAssignmentInput) => Promise<unknown>;
}

interface CollisionState {
  input: CycleBuilderCellSelectInput;
  source: CycleBuilderAssignment;
  target?: CycleBuilderAssignment;
}

interface OverrideState {
  input: CycleBuilderCellSelectInput;
  volunteerName: string;
}

type CollisionAction = 'move' | 'both' | 'swap';

function getBelowFullCount(data: CycleBuilderData): number {
  return data.events.reduce(
    (eventCount, event) =>
      eventCount +
      event.slots.reduce(
        (slotCount, slot) =>
          slotCount +
          (slot.included
            ? slot.shifts.filter(
                (shift) => shift.assignedCount < shift.requiredCount,
              ).length
            : 0),
        0,
      ),
    0,
  );
}

function isActiveAssignment(assignment: CycleBuilderAssignment): boolean {
  return assignment.status !== 'cancelled' && assignment.status !== 'declined';
}

export function CycleBuilder({
  data,
  onPublish,
  isPublishing,
  cycleId,
  ministryId,
  cycleStartDate,
  cycleEndDate,
  createAssignment,
  deleteAssignment,
  reassignAssignment,
}: CycleBuilderProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedVolunteerId, setSelectedVolunteerId] = useState<
    string | undefined
  >();
  const [auditOpen, setAuditOpen] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [collision, setCollision] = useState<CollisionState | null>(null);
  const [override, setOverride] = useState<OverrideState | null>(null);
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);
  const belowFullCount = getBelowFullCount(data);
  const isSaving =
    createAssignment.isPending ||
    deleteAssignment.isPending ||
    reassignAssignment.isPending;

  const applyAssignment = async (
    input: CycleBuilderCellSelectInput,
    overrideReason?: string,
  ) => {
    try {
      if (input.assignmentId) {
        await reassignAssignment.mutateAsync({
          assignmentId: input.assignmentId,
          body: {
            volunteerId: input.volunteerId,
            reason: 'Reassigned from the cycle builder',
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
      setSelectedVolunteerId(undefined);
      toast.success('Assignment saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Assignment failed');
    }
  };

  const applyCollision = async (action: CollisionAction) => {
    if (!collision) return;
    const { input, source, target } = collision;
    setCollision(null);

    if (action === 'both') {
      if (input.conflictType) {
        setOverride({
          input,
          volunteerName:
            input.volunteerName ?? source.volunteerName ?? input.volunteerId,
        });
        return;
      }
      await applyAssignment(input);
      return;
    }

    try {
      if (target && action === 'swap') {
        await reassignAssignment.mutateAsync({
          assignmentId: source.id,
          body: {
            volunteerId: target.volunteerId,
            reason: 'Swapped in the cycle builder',
          },
        });
        await reassignAssignment.mutateAsync({
          assignmentId: target.id,
          body: {
            volunteerId: input.volunteerId,
            reason: 'Swapped in the cycle builder',
          },
        });
      } else {
        await applyAssignment(input);
        await deleteAssignment.mutateAsync(source.id);
        return;
      }
      setSelectedVolunteerId(undefined);
      toast.success('Assignments swapped');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Assignment failed');
    }
  };

  const handleSelectAssignment = (input: CycleBuilderCellSelectInput) => {
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
        isActiveAssignment(assignment),
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
    if (input.conflictType && !input.assignmentId) {
      const volunteerName =
        input.volunteerName ??
        data.assignments.find(
          (assignment) => assignment.volunteerId === input.volunteerId,
        )?.volunteerName ??
        input.volunteerId;
      setOverride({ input, volunteerName });
      return;
    }
    void applyAssignment(input);
  };

  return (
    <div className="space-y-4" data-testid="cycle-builder">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-primary text-xs">Cycle board</p>
          <h1 className="font-semibold text-2xl tracking-tight">
            Map the cycle, then place with confidence
          </h1>
          <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
            See staffing across every event, then assign from the people most
            likely to serve.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size={isMobile ? 'touch' : 'sm'}
            variant="outline"
            onClick={() => setAuditOpen(true)}
          >
            Audit log
          </Button>
          <Button
            type="button"
            size={isMobile ? 'touch' : 'sm'}
            disabled={isPublishing || isSaving}
            onClick={() => setPublishDialogOpen(true)}
          >
            {isPublishing ? 'Publishing…' : 'Publish cycle'}
          </Button>
        </div>
      </div>

      <CycleBuilderBoard
        data={data}
        cycleStartDate={cycleStartDate}
        cycleEndDate={cycleEndDate}
        selectedDate={selectedDate}
        onSelectedDateChange={setSelectedDate}
        selectedVolunteerId={selectedVolunteerId}
        onSelectVolunteer={(volunteerId) =>
          setSelectedVolunteerId((current) =>
            current === volunteerId ? undefined : volunteerId,
          )
        }
        onSelectAssignment={handleSelectAssignment}
        onRemoveAssignment={setPendingRemovalId}
      />

      <AuditLogPanel
        open={auditOpen}
        onOpenChange={setAuditOpen}
        assignments={data.assignments}
        cycleId={cycleId}
        ministryId={ministryId}
      />

      <Dialog
        open={pendingRemovalId !== null}
        onOpenChange={(open) => !open && setPendingRemovalId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this assignment?</DialogTitle>
            <DialogDescription>
              This will leave the role unfilled until another volunteer is
              assigned.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingRemovalId(null)}
            >
              Keep assignment
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteAssignment.isPending}
              onClick={() => {
                if (!pendingRemovalId) return;
                void deleteAssignment
                  .mutateAsync(pendingRemovalId)
                  .then(() => {
                    toast.success('Assignment removed');
                    setPendingRemovalId(null);
                  })
                  .catch((error: unknown) =>
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : 'Assignment failed',
                    ),
                  );
              }}
            >
              {deleteAssignment.isPending ? 'Removing…' : 'Remove assignment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish this cycle?</DialogTitle>
            <DialogDescription>
              {belowFullCount > 0
                ? `${belowFullCount} shifts are below their staffing target. You can publish anyway.`
                : 'All included shifts meet their staffing target.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPublishDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isPublishing}
              onClick={() => {
                setPublishDialogOpen(false);
                onPublish(belowFullCount > 0);
              }}
            >
              {isPublishing ? 'Publishing…' : 'Publish cycle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={collision !== null}
        onOpenChange={(open) => !open && setCollision(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Volunteer already assigned</DialogTitle>
            <DialogDescription>
              {collision?.source.volunteerName ?? collision?.source.volunteerId}{' '}
              is already assigned elsewhere in this cycle.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            Choose whether to move the existing assignment or keep both.
          </div>
          <DialogFooter className="flex-wrap">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void applyCollision(collision?.target ? 'swap' : 'move')
              }
            >
              {collision?.target ? 'Swap assignments' : 'Move here'}
            </Button>
            <Button type="button" onClick={() => void applyCollision('both')}>
              Assign to both
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OverrideDialog
        open={override !== null}
        onOpenChange={(open) => !open && setOverride(null)}
        conflictType={override?.input.conflictType ?? 'unavailable'}
        volunteerName={override?.volunteerName ?? ''}
        slotLabel={override?.input.slotLabel ?? 'this shift'}
        isPending={isSaving}
        onConfirm={(reason) => {
          if (!override) return;
          void applyAssignment(override.input, reason);
          setOverride(null);
        }}
      />
    </div>
  );
}
