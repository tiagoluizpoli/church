import { useState } from 'react';
import type { CycleBuilderData } from '../../hooks/use-cycle-builder';
import { AuditLogPanel } from './audit-log-panel';
import { CycleBuilderBoard } from './cycle-builder-board';
import type { CycleBuilderCellSelectInput } from './cycle-builder-cell';
import { CycleBuilderHeader } from './cycle-builder-header';
import { summarizeCycleStaffing } from './cycle-builder-matrix.utils';
import { OverrideDialog } from './override-dialog';
import {
  type CycleBuilderMutations,
  useCycleBuilderActions,
} from './use-cycle-builder-actions';
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
  cycleName?: string;
  cycleStartDate?: string;
  cycleEndDate?: string;
  createAssignment: CycleBuilderMutations['createAssignment'];
  deleteAssignment: CycleBuilderMutations['deleteAssignment'];
  reassignAssignment: CycleBuilderMutations['reassignAssignment'];
  syncedAt?: number;
  isRefreshing?: boolean;
}

interface RoleLabelForInput {
  input: CycleBuilderCellSelectInput;
  data: CycleBuilderData;
}

function roleLabelFor({ input, data }: RoleLabelForInput): string | undefined {
  return (
    input.roleLabel ?? data.roles.find((role) => role.id === input.roleId)?.name
  );
}

export function CycleBuilder({
  data,
  onPublish,
  isPublishing,
  cycleId,
  ministryId,
  cycleName,
  cycleStartDate,
  cycleEndDate,
  createAssignment,
  deleteAssignment,
  reassignAssignment,
  syncedAt,
  isRefreshing,
}: CycleBuilderProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedVolunteerId, setSelectedVolunteerId] = useState<
    string | undefined
  >();
  const [auditOpen, setAuditOpen] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);
  const staffing = summarizeCycleStaffing({ data });
  const belowFullCount = staffing.shiftsBelowTarget;
  const actions = useCycleBuilderActions({
    data,
    createAssignment,
    deleteAssignment,
    reassignAssignment,
    onAssignmentApplied: () => setSelectedVolunteerId(undefined),
  });

  const removedAssignment = pendingRemovalId
    ? data.assignments.find((assignment) => assignment.id === pendingRemovalId)
    : undefined;
  const removedVolunteerName =
    removedAssignment?.volunteerName ?? 'the volunteer';

  return (
    <div className="space-y-4" data-testid="cycle-builder">
      <p
        aria-live="polite"
        className="sr-only"
        data-testid="cycle-builder-announcer"
      >
        {actions.announcement}
      </p>
      <CycleBuilderHeader
        cycleName={cycleName}
        cycleStartDate={cycleStartDate}
        cycleEndDate={cycleEndDate}
        staffing={staffing}
        syncedAt={syncedAt}
        isRefreshing={isRefreshing}
        actions={
          <>
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
              disabled={isPublishing || actions.isSaving}
              onClick={() => setPublishDialogOpen(true)}
            >
              {isPublishing ? 'Publishing…' : 'Publish cycle'}
            </Button>
          </>
        }
      />

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
        onSelectAssignment={actions.handleSelectAssignment}
        onRemoveAssignment={setPendingRemovalId}
        failedWrites={actions.boardFailedWrites}
        onRetryFailedWrite={actions.retryFailedWrite}
        onDismissFailedWrite={actions.dismissFailedWrite}
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
                void actions
                  .removeAssignment({
                    assignmentId: pendingRemovalId,
                    volunteerName: removedVolunteerName,
                  })
                  .then(() => setPendingRemovalId(null));
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
        open={actions.collision !== null}
        onOpenChange={(open) => !open && actions.setCollision(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Volunteer already assigned</DialogTitle>
            <DialogDescription>
              {actions.collision?.source.volunteerName ??
                actions.collision?.source.volunteerId}{' '}
              is already assigned elsewhere in this cycle.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            Choose how to handle the existing assignment.
          </div>
          <DialogFooter className="flex-wrap">
            <Button
              type="button"
              variant="ghost"
              onClick={() => actions.setCollision(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void actions.applyCollision({
                  action: actions.collision?.target ? 'swap' : 'move',
                })
              }
            >
              {actions.collision?.target ? 'Swap assignments' : 'Move here'}
            </Button>
            <Button
              type="button"
              onClick={() => void actions.applyCollision({ action: 'both' })}
            >
              Assign to both
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OverrideDialog
        open={actions.override !== null}
        onOpenChange={(open) => !open && actions.setOverride(null)}
        conflictType={actions.override?.input.conflictType ?? 'unavailable'}
        volunteerName={actions.override?.volunteerName ?? ''}
        slotLabel={actions.override?.input.slotLabel ?? 'this shift'}
        roleLabel={
          actions.override
            ? roleLabelFor({ input: actions.override.input, data })
            : undefined
        }
        isPending={actions.isSaving}
        onConfirm={actions.confirmOverride}
      />
    </div>
  );
}
