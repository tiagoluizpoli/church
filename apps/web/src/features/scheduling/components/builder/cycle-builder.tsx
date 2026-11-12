import { appConfig } from '@church/app-config';
import { m } from '@church/i18n/messages';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CYCLE_BUILDER_QUERY_KEY,
  type CycleBuilderData,
} from '../../hooks/use-cycle-builder';
import {
  type CycleBuilderMutations,
  useCycleBuilderActions,
} from '../../hooks/use-cycle-builder-actions';
import {
  summarizeCycleCounts,
  summarizeCycleStaffing,
} from '../../utils/builder/cycle-builder-staffing.utils';
import { UnavailableConfirmDialog } from './assignment/unavailable-confirm-dialog';
import {
  type AssignmentProposal,
  AssignmentProposalPreview,
  type ProposalApplyState,
} from './assignment-proposal-preview';
import { AuditLogPanel } from './audit-log-panel';
import { CycleBuilderMatrix } from './board/cycle-builder-matrix';
import { CycleBuilderHeader } from './cycle-builder-header';
import { SwapRequestBoardProvider } from './swap-request/swap-request-context';
import {
  type LeaderSwapRequest,
  SwapRequestSheet,
} from './swap-request/swap-request-sheet';
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
import { randomId } from '@/shared/utils/id';
import { requestErrorMessage } from '@/shared/utils/request-error-message';
import { adminApi } from '@/utils/api-instances';

interface CycleBuilderProps {
  data: CycleBuilderData;
  onPublish: (confirmBelowFull: boolean) => void;
  onSendUpdates?: () => void;
  isPublishing: boolean;
  isSendingUpdates?: boolean;
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
  /** The leader list for this Schedule: drives the ⚠ and the request sheet. */
  swapRequests?: LeaderSwapRequest[];
  selectedSwapRequestId?: string;
  onSelectSwapRequest?: (swapRequestId: string | undefined) => void;
}

const EMPTY_SWAP_REQUESTS: LeaderSwapRequest[] = [];

export function CycleBuilder({
  data,
  onPublish,
  onSendUpdates,
  isPublishing,
  isSendingUpdates = false,
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
  swapRequests = EMPTY_SWAP_REQUESTS,
  selectedSwapRequestId,
  onSelectSwapRequest,
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
  const queryClient = useQueryClient();
  const refreshBoard = () =>
    void queryClient.invalidateQueries({ queryKey: CYCLE_BUILDER_QUERY_KEY });
  // Each reviewed preview gets one key; every retry of it resends that key,
  // so a lost response is recovered rather than applied twice (ADR 0013).
  const [applicationKey, setApplicationKey] = useState('');
  // A read, kept only in memory: discarding it writes nothing.
  const proposal = useMutation({
    mutationFn: () => adminApi.getAssignmentProposal(cycleId, { ministryId }),
    onSuccess: () => setApplicationKey(randomId()),
    onError: () => {
      toast.error(m.builder_proposal_error());
      // The Schedule may have moved on (e.g. published elsewhere).
      refreshBoard();
    },
  });
  const applyProposal = useMutation({
    mutationFn: ({ reviewToken, additions }: AssignmentProposal) =>
      adminApi.applyAssignmentProposal(
        cycleId,
        {
          applicationKey,
          reviewToken,
          additions: additions.map(({ shiftRequirementId, volunteerId }) => ({
            shiftRequirementId,
            volunteerId,
          })),
        },
        { ministryId },
      ),
    onSuccess: ({ additions }) => {
      toast.success(m.builder_proposal_applied({ count: additions.length }));
      proposal.reset();
    },
    onSettled: refreshBoard,
  });
  const discardProposal = () => {
    applyProposal.reset();
    proposal.reset();
  };
  const reviewNewProposal = () => {
    applyProposal.reset();
    proposal.mutate();
  };
  const applyError = applyProposal.error;
  // A 4xx is a definite refusal; anything else may have committed.
  const refused =
    isAxiosError(applyError) &&
    applyError.response !== undefined &&
    applyError.response.status < 500;
  const applyState: ProposalApplyState = applyProposal.isPending
    ? { status: 'pending' }
    : !applyError
      ? { status: 'idle' }
      : refused
        ? { status: 'refused', message: requestErrorMessage(applyError) }
        : { status: 'unknown' };
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

  const [coverAssignmentId, setCoverAssignmentId] = useState<string>();
  const openRequestByAssignment = useMemo(() => {
    const entries = swapRequests
      .filter(({ status }) => status === 'open')
      .map(({ assignmentId, id }): [string, string] => [assignmentId, id]);
    return new Map(entries);
  }, [swapRequests]);
  const onOpenSwapRequest = useCallback(
    (id: string) => onSelectSwapRequest?.(id),
    [onSelectSwapRequest],
  );
  const onCoverHandled = useCallback(() => setCoverAssignmentId(undefined), []);
  const swapRequestContext = useMemo(
    () => ({
      openRequestByAssignment,
      onOpenSwapRequest,
      coverAssignmentId,
      onCoverHandled,
    }),
    [
      openRequestByAssignment,
      onOpenSwapRequest,
      coverAssignmentId,
      onCoverHandled,
    ],
  );
  const selectedSwapRequest = swapRequests.find(
    ({ id }) => id === selectedSwapRequestId,
  );

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
      {(data.affectedVolunteerCount ?? 0) > 0 ? (
        <Button
          type="button"
          size={isMobile ? 'touch' : 'sm'}
          disabled={!onSendUpdates || isSendingUpdates || actions.isSaving}
          onClick={onSendUpdates}
        >
          {m.builder_send_updates({ count: data.affectedVolunteerCount ?? 0 })}
        </Button>
      ) : null}
      {publishableEvents.length > 0 ? (
        <Button
          type="button"
          size={isMobile ? 'touch' : 'sm'}
          variant="outline"
          disabled={proposal.isPending || isPublishing}
          onClick={() => proposal.mutate()}
        >
          {proposal.isPending
            ? m.builder_proposal_loading()
            : m.builder_proposal_open()}
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
    <SwapRequestBoardProvider value={swapRequestContext}>
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

        {proposal.data ? (
          <AssignmentProposalPreview
            data={data}
            proposal={proposal.data}
            applyState={applyState}
            onApply={applyProposal.mutate}
            onReviewNew={reviewNewProposal}
            onDiscard={discardProposal}
          />
        ) : null}

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

        {selectedSwapRequest ? (
          <SwapRequestSheet
            ministryId={ministryId}
            request={selectedSwapRequest}
            onCover={() => {
              // Cover only leads to the board actions; the Assignment change closes the request.
              setCoverAssignmentId(selectedSwapRequest.assignmentId);
              onSelectSwapRequest?.(undefined);
            }}
            onOpenChange={(open) => !open && onSelectSwapRequest?.(undefined)}
          />
        ) : null}
      </WorkspacePage>
    </SwapRequestBoardProvider>
  );
}
