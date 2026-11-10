import { appConfig } from '@church/app-config';
import { m } from '@church/i18n/messages';
import { useState } from 'react';
import type { CycleBuilderData } from '../../hooks/use-cycle-builder';
import {
  type CycleBuilderMutations,
  useCycleBuilderActions,
} from '../../hooks/use-cycle-builder-actions';
import {
  summarizeCycleCounts,
  summarizeCycleStaffing,
} from '../../utils/builder/cycle-builder-staffing.utils';
import { UnavailableConfirmDialog } from './assignment/unavailable-confirm-dialog';
import { AuditLogPanel } from './audit-log-panel';
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
  moveAssignment?: CycleBuilderMutations['moveAssignment'];
  syncedAt?: number;
  isRefreshing?: boolean;
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
  moveAssignment,
  syncedAt,
  isRefreshing,
}: CycleBuilderProps) {
  const { auditPanel } = appConfig.parked;
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
  const publishableEvents = data.events.filter(
    (event) =>
      event.status !== 'cancelled' &&
      (event.state === 'assigning' || event.state === 'availability_requested'),
  );
  const publishStaffing = summarizeCycleStaffing({
    data: { ...data, events: publishableEvents },
  });
  const belowFullCount = publishStaffing.shiftsBelowTarget;
  const emptyPlaces = publishStaffing.required - publishStaffing.coveredPlaces;
  const actions = useCycleBuilderActions({
    data,
    createAssignment,
    deleteAssignment,
    reassignAssignment,
    moveAssignment,
    onAssignmentApplied: () => setSelectedVolunteerId(undefined),
  });

  const removedAssignment = pendingRemovalId
    ? data.assignments.find((assignment) => assignment.id === pendingRemovalId)
    : undefined;
  const removedVolunteerName =
    removedAssignment?.volunteerName ?? m.builder_ui_the_volunteer();

  // Rendered on the filter toolbar's own row (B-4 header pass) rather than
  // the header — audit/publish sit with the rest of this screen's controls
  // instead of stretching a panel that otherwise only carries title + stats.
  const toolbarActions = (
    <>
      {auditPanel ? (
        <Button
          type="button"
          size={isMobile ? 'touch' : 'sm'}
          variant="outline"
          onClick={() => setAuditOpen(true)}
        >
          {m.builder_ui_audit()}
        </Button>
      ) : null}
      {publishableEvents.length > 0 ? (
        <Button
          type="button"
          size={isMobile ? 'touch' : 'sm'}
          disabled={isPublishing || actions.isSaving}
          onClick={() => setPublishDialogOpen(true)}
        >
          {isPublishing ? m.builder_ui_publishing() : m.builder_ui_publish()}
        </Button>
      ) : null}
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
        onMoveAssignment={actions.handleMove}
        onRemoveAssignment={setPendingRemovalId}
        actions={toolbarActions}
        failedWrites={actions.boardFailedWrites}
        onRetryFailedWrite={actions.retryFailedWrite}
        onDismissFailedWrite={actions.dismissFailedWrite}
      />

      {auditPanel ? (
        <AuditLogPanel
          open={auditOpen}
          onOpenChange={setAuditOpen}
          assignments={data.assignments}
          cycleId={cycleId}
          ministryId={ministryId}
        />
      ) : null}

      <Dialog
        open={pendingRemovalId !== null}
        onOpenChange={(open) => !open && setPendingRemovalId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.builder_ui_remove_title()}</DialogTitle>
            <DialogDescription>
              {m.builder_ui_remove_description()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingRemovalId(null)}
            >
              {m.builder_ui_keep()}
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
              {deleteAssignment.isPending
                ? m.builder_ui_removing()
                : m.builder_ui_remove()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.builder_ui_publish_title()}</DialogTitle>
            <DialogDescription>
              {belowFullCount > 0
                ? m.builder_ui_publish_gaps({
                    places: emptyPlaces,
                    shifts: belowFullCount,
                  })
                : m.builder_ui_publish_full()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPublishDialogOpen(false)}
            >
              {m.builder_ui_cancel()}
            </Button>
            <Button
              type="button"
              disabled={isPublishing}
              onClick={() => {
                setPublishDialogOpen(false);
                onPublish(belowFullCount > 0);
              }}
            >
              {isPublishing
                ? m.builder_ui_publishing()
                : m.builder_ui_publish()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UnavailableConfirmDialog
        open={actions.unavailable !== null}
        onOpenChange={(open) => !open && actions.setUnavailable(null)}
        volunteerName={actions.unavailable?.volunteerName ?? ''}
        volunteerMembership={actions.unavailable?.volunteerMembership}
        eventTimeBlockLabel={
          actions.unavailable?.input.eventTimeBlockLabel ??
          m.builder_ui_this_shift()
        }
        isPending={actions.isSaving}
        onConfirm={actions.confirmUnavailable}
      />
    </WorkspacePage>
  );
}
