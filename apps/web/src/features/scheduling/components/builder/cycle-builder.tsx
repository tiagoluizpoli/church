import { appConfig } from '@church/app-config';
import { m } from '@church/i18n/messages';
import { now } from '@church/time';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import {
  CYCLE_BUILDER_QUERY_KEY,
  type CycleBuilderData,
} from '../../hooks/use-cycle-builder';
import {
  type CycleBuilderMutations,
  useCycleBuilderActions,
} from '../../hooks/use-cycle-builder-actions';
import { proposalAdditionKey } from '../../utils/builder/assignment-proposal.utils';
import {
  summarizeCycleCounts,
  summarizeCycleStaffing,
} from '../../utils/builder/cycle-builder-staffing.utils';
import { isCancelledEvent } from '../../utils/scheduling-rules';
import { UnavailableConfirmDialog } from './assignment/unavailable-confirm-dialog';
import {
  AssignmentProposalPreview,
  type ProposalApplyState,
  ProposalLoading,
  type ProposalSelection,
} from './assignment-proposal-preview';
import { AuditLogPanel } from './audit-log-panel';
import { CycleBuilderMatrix } from './board/cycle-builder-matrix';
import { RecentlyAddedProvider } from './board/recently-added-context';
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
import { Spinner } from '@/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { WorkspacePage } from '@/components/workspace-page';
import { useMediaQuery } from '@/hooks/use-media-query';
import type { ApplyAssignmentProposalBodyExcludedAdditionsItem } from '@/infrastructure/api/churchAPI.schemas';
import { randomId } from '@/shared/utils/id';
import { requestErrorMessage } from '@/shared/utils/request-error-message';
import { adminApi } from '@/utils/api-instances';

interface CycleBuilderProps {
  data: CycleBuilderData;
  onPublish: (confirmBelowFull: boolean) => void;
  onSendUpdates?: () => void;
  isPublishing: boolean;
  isSendingUpdates?: boolean;
  /** The server refused the publish as below target, with this many places open. */
  refusedGapCount?: number;
  onDismissRefusal?: () => void;
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
  /** The date strip's selected days, kept in the route's `?days=`. */
  selectedDates: string[];
  onSelectedDatesChange: (dates: string[]) => void;
}

const EMPTY_SWAP_REQUESTS: LeaderSwapRequest[] = [];

export function CycleBuilder({
  data,
  onPublish,
  onSendUpdates,
  isPublishing,
  isSendingUpdates = false,
  refusedGapCount,
  onDismissRefusal,
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
  selectedDates,
  onSelectedDatesChange,
}: CycleBuilderProps) {
  const { auditPanel } = appConfig.parked;
  const isMobile = useMediaQuery('(max-width: 767px)');
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
      !isCancelledEvent({ eventStatus: event.status }) &&
      (event.state === 'assigning' || event.state === 'availability_requested'),
  );
  const proposalDisabledReasonId = useId();
  let proposalDisabledReason: string | null = null;
  if (publishableEvents.length === 0) {
    proposalDisabledReason = data.events.some(
      (event) => event.state === 'published',
    )
      ? m.builder_proposal_disabled_published()
      : m.builder_proposal_disabled_no_availability();
  }
  const publishData = { ...data, events: publishableEvents };
  // The server's below-full check counts started Shifts too.
  const confirmBelowFull =
    summarizeCycleStaffing({ data: publishData }).shiftsBelowTarget > 0;
  // Assignments are fixed once a Shift starts, so the dialog only counts the
  // places a leader can still fill.
  const openStaffing = summarizeCycleStaffing({
    data: publishData,
    openAt: now(),
  });
  const belowFullCount = openStaffing.shiftsBelowTarget;
  const emptyPlaces = openStaffing.required - openStaffing.coveredPlaces;
  // A refusal reopens the confirmation: the server saw gaps the board did not.
  const isRefused = refusedGapCount !== undefined;
  let publishDescription = m.builder_ui_publish_full();
  if (isRefused) {
    publishDescription = m.prepare_publish_gaps({ count: refusedGapCount });
  } else if (belowFullCount > 0) {
    publishDescription = m.builder_ui_publish_gaps({
      places: emptyPlaces,
      shifts: belowFullCount,
    });
  }
  const closePublishDialog = () => {
    setPublishDialogOpen(false);
    onDismissRefusal?.();
  };
  const queryClient = useQueryClient();
  const refreshBoard = () =>
    void queryClient.invalidateQueries({ queryKey: CYCLE_BUILDER_QUERY_KEY });
  // One key per reviewed preview and exclusion set: every retry of the same
  // selection resends its key, so a lost response is recovered rather than
  // applied twice, and a changed selection never reuses one (ADR 0013).
  const applicationKeys = useRef(new Map<string, string>());
  // Picks the leader left out, mirrored here (a ref: the board must not
  // re-render on each toggle) so a fresh review after a refusal keeps every
  // exclusion that still names a pair of the new proposal.
  const exclusions = useRef<ReadonlySet<string>>(new Set());
  // Each request carries its run number; Cancel moves past it, so a response
  // that lands after the leader cancelled is never reported as an error.
  const proposalRun = useRef(0);
  // A read, kept only in memory: discarding it writes nothing.
  const proposal = useMutation({
    mutationFn: (_run: number) =>
      adminApi.getAssignmentProposal(cycleId, { ministryId }),
    onSuccess: ({ additions }) => {
      applicationKeys.current = new Map();
      const valid = new Set(additions.map(proposalAdditionKey));
      // Runs before the new proposal renders, so the review starts pruned.
      exclusions.current = new Set(
        [...exclusions.current].filter((key) => valid.has(key)),
      );
    },
    onError: (_error, run) => {
      if (run !== proposalRun.current) return;
      toast.error(m.builder_proposal_error());
      // The Schedule may have moved on (e.g. published elsewhere).
      refreshBoard();
    },
  });
  const [recentlyAdded, setRecentlyAdded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  useEffect(() => {
    if (recentlyAdded.size === 0) return;
    const timer = setTimeout(() => setRecentlyAdded(new Set()), 6000);
    return () => clearTimeout(timer);
  }, [recentlyAdded]);
  const applyProposal = useMutation({
    mutationFn: ({
      proposal: { reviewToken, additions },
      excluded,
    }: ProposalSelection) => {
      const pair = ({
        shiftRequirementId,
        volunteerId,
      }: ApplyAssignmentProposalBodyExcludedAdditionsItem) => ({
        shiftRequirementId,
        volunteerId,
      });
      const selection = excluded.map(proposalAdditionKey).sort().join(',');
      const applicationKey =
        applicationKeys.current.get(selection) ?? randomId();
      applicationKeys.current.set(selection, applicationKey);
      return adminApi.applyAssignmentProposal(
        cycleId,
        {
          applicationKey,
          reviewToken,
          additions: additions.map(pair),
          ...(excluded.length > 0 && { excludedAdditions: excluded.map(pair) }),
        },
        { ministryId },
      );
    },
    onSuccess: ({ additions }) => {
      toast.success(m.builder_proposal_applied({ count: additions.length }));
      setRecentlyAdded(
        new Set(additions.map(({ assignmentId }) => assignmentId)),
      );
      exclusions.current = new Set();
      proposal.reset();
    },
    onSettled: refreshBoard,
  });
  const requestProposal = () => proposal.mutate(++proposalRun.current);
  const discardProposal = () => {
    applyProposal.reset();
    exclusions.current = new Set();
    proposal.reset();
  };
  const cancelProposal = () => {
    proposalRun.current += 1;
    discardProposal();
  };
  const reviewNewProposal = () => {
    applyProposal.reset();
    requestProposal();
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
      {proposalDisabledReason ? (
        <Tooltip>
          <TooltipTrigger
            render={
              // aria-disabled (not disabled) keeps the button focusable and
              // tappable, so the reason reaches keyboard and touch users too.
              <Button
                type="button"
                size={isMobile ? 'touch' : 'sm'}
                variant="outline"
                aria-disabled="true"
                aria-describedby={proposalDisabledReasonId}
                className="aria-disabled:opacity-50"
                onClick={() => toast.info(proposalDisabledReason)}
              >
                {m.builder_proposal_open()}
              </Button>
            }
          />
          <TooltipContent>{proposalDisabledReason}</TooltipContent>
          <span className="sr-only" id={proposalDisabledReasonId}>
            {proposalDisabledReason}
          </span>
        </Tooltip>
      ) : (
        <Button
          type="button"
          size={isMobile ? 'touch' : 'sm'}
          variant="outline"
          disabled={proposal.isPending || isPublishing}
          onClick={requestProposal}
        >
          {proposal.isPending ? <Spinner /> : null}
          {proposal.isPending
            ? m.builder_proposal_loading()
            : m.builder_proposal_open()}
        </Button>
      )}
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
      <RecentlyAddedProvider value={recentlyAdded}>
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
            selectedDates={selectedDates}
            onSelectedDatesChange={onSelectedDatesChange}
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
                  {deleteAssignment.isPending ? <Spinner /> : null}
                  {deleteAssignment.isPending
                    ? m.builder_ui_removing()
                    : m.builder_ui_remove()}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={publishDialogOpen || isRefused}
            onOpenChange={(open) => !open && closePublishDialog()}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{m.builder_ui_publish_title()}</DialogTitle>
                <DialogDescription>{publishDescription}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closePublishDialog}
                >
                  {m.builder_ui_cancel()}
                </Button>
                <Button
                  type="button"
                  disabled={isPublishing}
                  onClick={() => {
                    closePublishDialog();
                    onPublish(isRefused || confirmBelowFull);
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
              exclusions={exclusions}
              onApply={applyProposal.mutate}
              onReviewNew={reviewNewProposal}
              onDiscard={discardProposal}
            />
          ) : proposal.isPending ? (
            <ProposalLoading onCancel={cancelProposal} />
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
      </RecentlyAddedProvider>
    </SwapRequestBoardProvider>
  );
}
