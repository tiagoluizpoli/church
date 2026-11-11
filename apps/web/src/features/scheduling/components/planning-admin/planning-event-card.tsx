import { m } from '@church/i18n/messages';
import type { Instant } from '@church/time';
import { Link } from '@tanstack/react-router';
import { Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ConfirmDeleteEventTimeBlockInput } from './calendar-row';
import { EventCancelDialog } from './event-cancel-dialog';
import { EventMovePreview } from './event-move-preview';
import type { CycleCalendarTableRow } from './planning-admin.types';
import {
  eventStatusBadgeVariant,
  eventStatusLabel,
  timeBlockCountLabel,
} from './planning-admin.utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatInstantRangeOf } from '@/shared/utils/church-time';

export interface PlanningEventCardProps {
  row: CycleCalendarTableRow;
  /** The reviewed Cycle, for the nested Edit Event link. */
  cycleId: string;
  isReadOnly: boolean;
  /** A scheduled Event of a Sent Cycle can be previewed for a move. */
  canPreviewMove?: boolean;
  /** A future scheduled Event of a Sent Cycle can be cancelled. */
  canCancel?: boolean;
  deleteEventTimeBlockPending: boolean;
  onDeleteEventTimeBlockConfirm: (
    input: ConfirmDeleteEventTimeBlockInput,
  ) => void;
}

/** Which delete-confirm dialog (if any) is open on this card — kept local
 * rather than shared with the desktop table's `dialogState`, since both
 * surfaces render unconditionally (only CSS-hidden per breakpoint) and a
 * shared boolean would pop both surfaces' confirm dialogs open at once. */
type ConfirmState =
  | { kind: 'none' }
  | { kind: 'event-time-block'; eventTimeBlockId: string };

export function PlanningEventCard({
  row,
  cycleId,
  isReadOnly,
  canPreviewMove = false,
  canCancel = false,
  deleteEventTimeBlockPending,
  onDeleteEventTimeBlockConfirm,
}: PlanningEventCardProps) {
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    kind: 'none',
  });
  const { churchTimezone } = useTimezone();
  const isCancelled = row.status === 'cancelled';

  /** Auto-close the confirm dialog on the falling edge of pending (mutation
   * settled) instead of synchronously in the click handler — otherwise the
   * dialog disappears before `deleteEventTimeBlockPending` ever
   * gets a chance to render, leaving no visible feedback during the delete. */
  const prevDeleteEventTimeBlockPendingRef = useRef(
    deleteEventTimeBlockPending,
  );
  useEffect(() => {
    if (
      prevDeleteEventTimeBlockPendingRef.current &&
      !deleteEventTimeBlockPending
    ) {
      setConfirmState((current) =>
        current.kind === 'event-time-block' ? { kind: 'none' } : current,
      );
    }
    prevDeleteEventTimeBlockPendingRef.current = deleteEventTimeBlockPending;
  }, [deleteEventTimeBlockPending]);

  return (
    <div
      className={cn(
        'surface-subtle workspace-panel',
        isCancelled && 'opacity-60',
      )}
      data-testid="planning-event-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div
            className={cn(
              'font-medium text-base',
              isCancelled && 'line-through',
            )}
          >
            {row.title}
          </div>
          {row.location ? (
            <div className="text-muted-foreground text-xs">
              {m.cycle_review_location({ location: row.location })}
            </div>
          ) : null}
          <div className="text-muted-foreground text-xs">
            {formatInstantRangeOf({
              start: row.start,
              end: row.end,
              timeZone: churchTimezone,
            })}
          </div>
          <div className="text-muted-foreground text-xs">
            {timeBlockCountLabel({ count: row.eventTimeBlocks.length })}
          </div>
        </div>
        <Badge variant={eventStatusBadgeVariant({ status: row.status })}>
          {eventStatusLabel({ status: row.status })}
        </Badge>
      </div>

      {!isReadOnly ? (
        <div className="mt-3 flex items-center gap-1">
          <Link
            to="/cycles/$cycleId/events/$eventId"
            params={{ cycleId, eventId: row.eventId }}
            className={buttonVariants({ size: 'touch', variant: 'ghost' })}
            aria-label={m.cycle_review_edit_day({ title: row.title })}
          >
            <Pencil className="size-3.5" /> {m.cycle_review_edit()}
          </Link>
        </div>
      ) : null}

      {canPreviewMove || canCancel ? (
        <div className="mt-3 flex items-center gap-1">
          {canPreviewMove ? (
            <EventMovePreview
              cycleId={cycleId}
              eventId={row.eventId}
              title={row.title}
              start={row.start as Instant}
            />
          ) : null}
          {canCancel ? (
            <EventCancelDialog
              cycleId={cycleId}
              eventId={row.eventId}
              title={row.title}
            />
          ) : null}
        </div>
      ) : null}

      {row.eventTimeBlocks.length > 0 ? (
        <ul className="mt-3 space-y-2 text-muted-foreground text-xs">
          {row.eventTimeBlocks.map((eventTimeBlock) => (
            <li
              key={eventTimeBlock.eventTimeBlockId}
              data-testid="planning-event-time-block-item"
              className="flex items-center justify-between gap-2"
            >
              <span>
                <span>{eventTimeBlock.label}</span> ·{' '}
                <span>
                  {formatInstantRangeOf({
                    start: eventTimeBlock.startTime,
                    end: eventTimeBlock.endTime,
                    timeZone: churchTimezone,
                  })}
                </span>
              </span>
              {canPreviewMove ? (
                <EventMovePreview
                  cycleId={cycleId}
                  eventId={row.eventId}
                  eventTimeBlockId={eventTimeBlock.eventTimeBlockId}
                  title={`${row.title} · ${eventTimeBlock.label}`}
                  start={eventTimeBlock.startTime as Instant}
                  size="icon-xs"
                />
              ) : null}
              {!isReadOnly ? (
                <span className="flex items-center gap-1">
                  {eventTimeBlock.isOnlyEventTimeBlockInEvent ? (
                    <Button
                      type="button"
                      size="icon-touch"
                      variant="destructive"
                      disabled
                      aria-label={m.cycle_review_delete_time_block({
                        label: eventTimeBlock.label,
                      })}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  ) : (
                    <AlertDialog
                      open={
                        confirmState.kind === 'event-time-block' &&
                        confirmState.eventTimeBlockId ===
                          eventTimeBlock.eventTimeBlockId
                      }
                      onOpenChange={(open) =>
                        setConfirmState(
                          open
                            ? {
                                kind: 'event-time-block',
                                eventTimeBlockId:
                                  eventTimeBlock.eventTimeBlockId,
                              }
                            : { kind: 'none' },
                        )
                      }
                    >
                      <AlertDialogTrigger
                        render={
                          <Button
                            type="button"
                            size="icon-touch"
                            variant="destructive"
                            aria-label={m.cycle_review_delete_time_block({
                              label: eventTimeBlock.label,
                            })}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        }
                      />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {m.cycle_review_delete_time_block_title()}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {m.cycle_review_delete_time_block_description({
                              label: eventTimeBlock.label,
                            })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel
                            disabled={deleteEventTimeBlockPending}
                          >
                            {m.cycle_review_cancel()}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            disabled={deleteEventTimeBlockPending}
                            onClick={() =>
                              onDeleteEventTimeBlockConfirm({
                                eventId: row.eventId,
                                eventTimeBlockId:
                                  eventTimeBlock.eventTimeBlockId,
                              })
                            }
                          >
                            {deleteEventTimeBlockPending
                              ? m.cycle_review_deleting()
                              : m.cycle_review_delete_time_block_confirm()}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
