import { m } from '@church/i18n/messages';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Ban } from 'lucide-react';
import { useState } from 'react';
import { getErrorMessage } from './planning-admin.utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CYCLE_BUILDER_QUERY_KEY } from '@/features/scheduling/hooks/use-cycle-builder';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatInstantRangeOf } from '@/shared/utils/church-time';
import { pluralMessage } from '@/shared/utils/plural';
import { adminApi } from '@/utils/api-instances';

/** Every read a cancellation changes: planning, Schedules, notices, Volunteer reads. */
const CANCELLATION_READERS = [
  ['cycles'],
  CYCLE_BUILDER_QUERY_KEY,
  ['notifications'],
  ['my-schedule'],
  ['my-ministry-schedule'],
  ['volunteer-dashboard'],
  ['assignment-detail'],
  ['availability-checks'],
  ['availability-check'],
] as const;

interface RefusalBody {
  error?: string;
}

export interface EventCancelDialogProps {
  cycleId: string;
  eventId: string;
  /** Cancels only this block through the nested endpoints. */
  eventTimeBlockId?: string;
  title: string;
  size?: 'touch' | 'icon-xs';
}

/**
 * Irreversibly cancels a future scheduled Event of a Sent Cycle. Opening the
 * dialog previews the impact (who is told now, open SwapRequests); confirm
 * stays disabled until the localized fixed word is typed, even with no
 * impact, and the success state shows the server's recalculated result.
 */
export function EventCancelDialog({
  cycleId,
  eventId,
  eventTimeBlockId,
  title,
  size = 'touch',
}: EventCancelDialogProps) {
  const { churchTimezone } = useTimezone();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const queryClient = useQueryClient();
  const refreshPlanning = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['cycle-details', cycleId] }),
      ...CANCELLATION_READERS.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
      queryClient.invalidateQueries({
        predicate: ({ queryKey: [key] }) =>
          typeof key === 'string' && key.startsWith('prepare-'),
      }),
    ]);
  // The scope has started: refresh so it shows read-only behind the refusal.
  const refreshWhenWindowClosed = (error: Error) => {
    if (
      isAxiosError<RefusalBody>(error) &&
      error.response?.data?.error === 'ADMIN_CANCELLATION_WINDOW_CLOSED'
    ) {
      void refreshPlanning();
    }
  };
  const preview = useMutation({
    mutationFn: () =>
      eventTimeBlockId
        ? adminApi.previewPlanningEventTimeBlockCancellation(
            cycleId,
            eventId,
            eventTimeBlockId,
          )
        : adminApi.previewPlanningEventCancellation(cycleId, eventId),
    onError: refreshWhenWindowClosed,
  });
  const cancel = useMutation({
    mutationFn: (confirmation: string) =>
      eventTimeBlockId
        ? adminApi.cancelPlanningEventTimeBlock(
            cycleId,
            eventId,
            eventTimeBlockId,
            { confirmation },
          )
        : adminApi.cancelPlanningEvent(cycleId, eventId, { confirmation }),
    onError: refreshWhenWindowClosed,
  });
  const impact = preview.data;
  const done = cancel.data;
  const word = m.cancellation_confirm_word();
  // The server's rule: trimmed, any letter case, nothing else.
  const typedMatches = typed.trim().toLowerCase() === word.toLowerCase();
  const error = cancel.error ?? preview.error;

  const openDialog = () => {
    setOpen(true);
    preview.mutate();
  };

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (next) return;
    // Refresh only once closed, so the success state stays readable.
    if (done) void refreshPlanning();
    setTyped('');
    preview.reset();
    cancel.reset();
  };

  const range =
    impact &&
    formatInstantRangeOf({
      start: impact.start,
      end: impact.end,
      timeZone: churchTimezone,
    });

  return (
    <>
      <Button
        type="button"
        size={size}
        variant="ghost"
        aria-label={m.event_cancel_action_label({ title })}
        onClick={openDialog}
      >
        <Ban className="size-3.5" />
        {size === 'touch'
          ? eventTimeBlockId
            ? m.event_cancel_block_action()
            : m.event_cancel_action()
          : null}
      </Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent data-testid="event-cancel-dialog">
          <DialogHeader>
            <DialogTitle>{m.event_cancel_title({ title })}</DialogTitle>
            {range ? (
              <DialogDescription>
                {m.event_cancel_scope({ range })}
              </DialogDescription>
            ) : null}
          </DialogHeader>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {getErrorMessage({ error })}
            </p>
          ) : null}
          {done ? (
            <p className="font-medium text-sm" data-testid="event-cancel-done">
              {done.volunteerCount === 0
                ? m.event_cancel_done_none()
                : pluralMessage({
                    count: done.volunteerCount,
                    one: () => m.event_cancel_done_one(),
                    other: () =>
                      m.event_cancel_done_other({ count: done.volunteerCount }),
                  })}
            </p>
          ) : impact ? (
            <div
              className="space-y-3 text-sm"
              data-testid="event-cancel-impact"
            >
              <ul className="space-y-1">
                <li>
                  {impact.volunteerCount === 0
                    ? m.event_cancel_volunteers_none()
                    : pluralMessage({
                        count: impact.volunteerCount,
                        one: () => m.event_cancel_volunteers_one(),
                        other: () =>
                          m.event_cancel_volunteers_other({
                            count: impact.volunteerCount,
                          }),
                      })}
                  {impact.volunteerCount > 0
                    ? ` ${pluralMessage({
                        count: impact.ministryCount,
                        one: () => m.event_cancel_ministries_one(),
                        other: () =>
                          m.event_cancel_ministries_other({
                            count: impact.ministryCount,
                          }),
                      })}`
                    : null}
                </li>
                {impact.openSwapRequestCount > 0 ? (
                  <li>
                    {pluralMessage({
                      count: impact.openSwapRequestCount,
                      one: () => m.event_cancel_swap_requests_one(),
                      other: () =>
                        m.event_cancel_swap_requests_other({
                          count: impact.openSwapRequestCount,
                        }),
                    })}
                  </li>
                ) : null}
              </ul>
              <p className="font-medium text-destructive">
                {m.event_cancel_warning()}
              </p>
              <div className="space-y-1">
                <Label htmlFor="event-cancel-confirmation">
                  {m.event_cancel_confirm_label({ word })}
                </Label>
                <Input
                  id="event-cancel-confirmation"
                  autoComplete="off"
                  value={typed}
                  onChange={(changed) => setTyped(changed.target.value)}
                />
              </div>
            </div>
          ) : preview.isPending ? (
            <p className="text-muted-foreground text-sm" role="status">
              {m.event_cancel_loading()}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {done
                ? m.event_cancel_done_close()
                : eventTimeBlockId
                  ? m.event_cancel_block_keep()
                  : m.event_cancel_keep()}
            </DialogClose>
            {impact && !done ? (
              <Button
                type="button"
                variant="destructive"
                disabled={!typedMatches || cancel.isPending}
                onClick={() => cancel.mutate(typed)}
              >
                {cancel.isPending
                  ? m.event_cancel_confirming()
                  : eventTimeBlockId
                    ? m.event_cancel_block_confirm()
                    : m.event_cancel_confirm()}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
