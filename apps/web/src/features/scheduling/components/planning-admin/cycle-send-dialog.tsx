import { m } from '@church/i18n/messages';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getErrorMessage } from './planning-admin.utils';
import { RetryAlert } from './retry-alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { pluralMessage } from '@/shared/utils/plural';
import { adminApi } from '@/utils/api-instances';

export interface CycleSendActionProps {
  cycleId: string;
  cycleName: string;
  eventCount: number;
}

/** Send to Ministries, disabled with its reason while the Draft is empty. */
export function CycleSendAction({
  cycleId,
  cycleName,
  eventCount,
}: CycleSendActionProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const isEmpty = eventCount === 0;
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        data-testid="send-cycle-button"
        disabled={isEmpty}
        aria-describedby={isEmpty ? 'send-cycle-empty-reason' : undefined}
        onClick={() => setIsConfirming(true)}
      >
        {m.cycle_review_send()}
      </Button>
      {isEmpty ? (
        <p
          id="send-cycle-empty-reason"
          className="text-muted-foreground text-xs"
        >
          {m.error_empty_cycle()}
        </p>
      ) : null}
      {isConfirming ? (
        <CycleSendDialog
          cycleId={cycleId}
          cycleName={cycleName}
          onClose={() => setIsConfirming(false)}
        />
      ) : null}
    </div>
  );
}

export interface CycleSendDialogProps {
  cycleId: string;
  cycleName: string;
  onClose: () => void;
}

interface InvalidEvent {
  id: string;
  title: string;
}

interface RefusalBody {
  error?: string;
  invalidEvents?: InvalidEvent[];
}

interface RefusalInput {
  error: unknown;
}

/** The Events a 409 INVALID_CYCLE_EVENTS names for repair, if any. */
function invalidEventsOf({ error }: RefusalInput) {
  if (!isAxiosError(error)) return [];
  return (error.response?.data as RefusalBody | undefined)?.invalidEvents ?? [];
}

const SUMMARY_CONFLICT_STATUS = 409;
const FIRST_SERVER_ERROR_STATUS = 500;
const RECOVERABLE_SUMMARY_STATUSES = new Set([408, 429]);

function isSummaryStateConflict({ error }: RefusalInput) {
  if (!isAxiosError<RefusalBody>(error)) return false;
  const { response } = error;
  return (
    response?.status === SUMMARY_CONFLICT_STATUS &&
    response.data?.error === 'ILLEGAL_STATE_TRANSITION'
  );
}

function isRecoverableSummaryError({ error }: RefusalInput) {
  if (!isAxiosError(error) || !error.response) return true;
  const { status } = error.response;
  return (
    status >= FIRST_SERVER_ERROR_STATUS ||
    RECOVERABLE_SUMMARY_STATUSES.has(status)
  );
}

function refusalMessage({ error }: RefusalInput) {
  return isAxiosError(error) && error.response
    ? getErrorMessage({ error })
    : m.cycle_send_failed();
}

function prefillMessage(count: number) {
  if (count === 0) return m.cycle_send_prefill_zero();
  return pluralMessage({
    count,
    one: m.cycle_send_prefill_one,
    other: () => m.cycle_send_prefill_other({ count }),
  });
}

/**
 * Confirms Send to Ministries with advisory counts: Send rechecks everything
 * itself. A failure keeps the dialog for retry; a refusal refreshes the
 * authoritative Cycle first.
 */
export function CycleSendDialog({
  cycleId,
  cycleName,
  onClose,
}: CycleSendDialogProps) {
  const queryClient = useQueryClient();
  const summary = useQuery({
    queryKey: ['cycle-send-summary', cycleId],
    queryFn: () => adminApi.getCycleSendSummary(cycleId),
    retry: false,
    gcTime: 0,
  });
  const refreshCycle = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cycle-details', cycleId] }),
        queryClient.invalidateQueries({ queryKey: ['cycles'] }),
      ]),
    [queryClient, cycleId],
  );
  useEffect(() => {
    if (isSummaryStateConflict({ error: summary.error })) {
      void refreshCycle();
    }
  }, [summary.error, refreshCycle]);
  const send = useMutation({
    mutationFn: () => adminApi.sendCycle(cycleId),
    onError: async () => {
      // A refusal may come from a state this page has not seen yet.
      await Promise.all([refreshCycle(), summary.refetch()]);
    },
    onSuccess: async () => {
      await Promise.all([
        refreshCycle(),
        // Sent Cycles now appear in every leader's Schedules.
        queryClient.invalidateQueries({
          predicate: ({ queryKey: [key] }) =>
            typeof key === 'string' && key.startsWith('prepare-'),
        }),
      ]);
      toast.success(m.cycle_send_success());
      onClose();
    },
  });
  const canRetrySummary =
    summary.isError && isRecoverableSummaryError({ error: summary.error });
  const invalidEvents = invalidEventsOf({
    error: send.error ?? summary.error,
  });

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !send.isPending) onClose();
      }}
    >
      <AlertDialogContent data-testid="cycle-send-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {m.cycle_send_title({ cycleName })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {m.cycle_send_irreversible()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {summary.isPending ? (
          <p className="text-muted-foreground text-sm">
            {m.cycle_send_summary_loading()}
          </p>
        ) : canRetrySummary ? (
          <RetryAlert
            message={m.cycle_send_summary_error()}
            testId="cycle-send-summary-error"
            onRetry={() => summary.refetch()}
            disabled={summary.isFetching}
          />
        ) : summary.data ? (
          <ul className="space-y-1 text-sm" data-testid="cycle-send-summary">
            <li>
              {pluralMessage({
                count: summary.data.eventCount,
                one: m.cycle_send_events_one,
                other: () =>
                  m.cycle_send_events_other({
                    count: summary.data.eventCount,
                  }),
              })}
            </li>
            <li>{prefillMessage(summary.data.prefilledMinistryCount)}</li>
          </ul>
        ) : null}
        {send.isError || (summary.isError && !canRetrySummary) ? (
          <div
            className="space-y-1 text-destructive text-sm"
            role="alert"
            data-testid="cycle-send-error"
          >
            <p>{refusalMessage({ error: send.error ?? summary.error })}</p>
            {invalidEvents.length > 0 ? (
              <ul className="list-disc ps-5">
                {invalidEvents.map((invalid) => (
                  <li key={invalid.id}>{invalid.title}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={send.isPending}>
            {m.cycle_send_cancel()}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={
              send.isPending || !summary.isSuccess || summary.isFetching
            }
            data-testid="confirm-cycle-send-button"
            onClick={(event) => {
              // Keep the dialog open until the mutation settles.
              event.preventDefault();
              if (summary.isSuccess && !summary.isFetching) send.mutate();
            }}
          >
            {send.isPending ? m.cycle_review_sending() : m.cycle_review_send()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
