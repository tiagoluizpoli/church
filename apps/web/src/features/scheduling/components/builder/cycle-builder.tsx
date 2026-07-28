import { useState } from 'react';
import type { CycleBuilderData } from '../../hooks/use-cycle-builder';
import {
  type CycleBuilderMutations,
  useCycleBuilderActions,
} from '../../hooks/use-cycle-builder-actions';
import { findShiftById } from '../../utils/builder/cycle-builder-shift-lookup.utils';
import {
  summarizeCycleCounts,
  summarizeCycleStaffing,
} from '../../utils/builder/cycle-builder-staffing.utils';
import { OverrideDialog } from './assignment/override-dialog';
import { AuditLogPanel } from './audit-log-panel';
import type { CycleBuilderCellSelectInput } from './board/cycle-builder-cell';
import { CycleBuilderMatrix } from './board/cycle-builder-matrix';
import { CycleBuilderHeader } from './cycle-builder-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { WorkspacePage } from '@/components/workspace-page';
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

interface ContextTeamIdForInput {
  input: CycleBuilderCellSelectInput;
  data: CycleBuilderData;
}

/**
 * The team the shift×role behind this override belongs to, if any — the same
 * `shift.requirements` lookup the board cell derives per-cell, resolved here
 * from the override's own shift/role pair so its "Team Leader" badge agrees
 * with the cell it came from (FR-013).
 */
function contextTeamIdFor({
  input,
  data,
}: ContextTeamIdForInput): string | undefined {
  const shift = findShiftById({ data, shiftId: input.shiftId });
  return shift?.requirements.find(
    (requirement) => requirement.roleId === input.roleId,
  )?.teamId;
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
  const counts = summarizeCycleCounts({ data, assignedCount: staffing.filled });
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

  // Rendered on the filter toolbar's own row (B-4 header pass) rather than
  // the header — audit/publish sit with the rest of this screen's controls
  // instead of stretching a panel that otherwise only carries title + stats.
  const toolbarActions = (
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
  );

  return (
    <WorkspacePage data-testid="cycle-builder">
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
        counts={counts}
        syncedAt={syncedAt}
        isRefreshing={isRefreshing}
      />

      <CycleBuilderMatrix
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
        actions={toolbarActions}
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
        volunteerMembership={actions.override?.volunteerMembership}
        slotLabel={actions.override?.input.slotLabel ?? 'this shift'}
        roleLabel={
          actions.override
            ? roleLabelFor({ input: actions.override.input, data })
            : undefined
        }
        isPending={actions.isSaving}
        onConfirm={actions.confirmOverride}
        contextTeamId={
          actions.override
            ? contextTeamIdFor({ input: actions.override.input, data })
            : undefined
        }
      />
    </WorkspacePage>
  );
}
