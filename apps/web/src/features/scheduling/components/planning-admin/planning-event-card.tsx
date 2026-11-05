import { m } from '@church/i18n/messages';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  ConfirmDeleteEventInput,
  ConfirmDeleteEventTimeBlockInput,
  StartCreateEventTimeBlockInput,
  StartEditEventInput,
  StartEditEventTimeBlockInput,
} from './calendar-row';
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
import { Button } from '@/components/ui/button';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatInstantRangeOf } from '@/shared/utils/church-time';

export interface PlanningEventCardProps {
  row: CycleCalendarTableRow;
  isReadOnly: boolean;
  deleteEventPending: boolean;
  deleteEventTimeBlockPending: boolean;
  onAddEventTimeBlockRequest: (input: StartCreateEventTimeBlockInput) => void;
  onEditEventRequest: (input: StartEditEventInput) => void;
  onDeleteEventConfirm: (input: ConfirmDeleteEventInput) => void;
  onEditEventTimeBlockRequest: (input: StartEditEventTimeBlockInput) => void;
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
  | { kind: 'event' }
  | { kind: 'event-time-block'; eventTimeBlockId: string };

export function PlanningEventCard({
  row,
  isReadOnly,
  deleteEventPending,
  deleteEventTimeBlockPending,
  onAddEventTimeBlockRequest,
  onEditEventRequest,
  onDeleteEventConfirm,
  onEditEventTimeBlockRequest,
  onDeleteEventTimeBlockConfirm,
}: PlanningEventCardProps) {
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    kind: 'none',
  });
  const { churchTimezone } = useTimezone();

  /** Auto-close the confirm dialog on the falling edge of pending (mutation
   * settled) instead of synchronously in the click handler — otherwise the
   * dialog disappears before `deleteEventPending`/`deleteEventTimeBlockPending` ever
   * gets a chance to render, leaving no visible feedback during the delete. */
  const prevDeleteEventPendingRef = useRef(deleteEventPending);
  useEffect(() => {
    if (prevDeleteEventPendingRef.current && !deleteEventPending) {
      setConfirmState((current) =>
        current.kind === 'event' ? { kind: 'none' } : current,
      );
    }
    prevDeleteEventPendingRef.current = deleteEventPending;
  }, [deleteEventPending]);

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
      className="surface-subtle workspace-panel"
      data-testid="planning-event-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="font-medium text-base">{row.title}</div>
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
          <Button
            type="button"
            size="touch"
            variant="ghost"
            aria-label={m.cycle_review_add_time_block_to({ title: row.title })}
            onClick={() => onAddEventTimeBlockRequest({ row })}
          >
            <Plus className="size-3.5" /> {m.cycle_review_add_time_block()}
          </Button>
          <Button
            type="button"
            size="touch"
            variant="ghost"
            aria-label={m.cycle_review_edit_day({ title: row.title })}
            onClick={() => onEditEventRequest({ row })}
          >
            <Pencil className="size-3.5" /> {m.cycle_review_edit()}
          </Button>
          <AlertDialog
            open={confirmState.kind === 'event'}
            onOpenChange={(open) =>
              setConfirmState(open ? { kind: 'event' } : { kind: 'none' })
            }
          >
            <AlertDialogTrigger
              render={
                <Button
                  type="button"
                  size="touch"
                  variant="destructive"
                  aria-label={m.cycle_review_delete_day({ title: row.title })}
                >
                  <Trash2 className="size-3.5" /> {m.cycle_review_delete()}
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {m.cycle_review_delete_day_title()}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {m.cycle_review_delete_day_description({ title: row.title })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteEventPending}>
                  {m.cycle_review_cancel()}
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={deleteEventPending}
                  onClick={() => onDeleteEventConfirm({ eventId: row.eventId })}
                >
                  {deleteEventPending
                    ? m.cycle_review_deleting()
                    : m.cycle_review_delete_event_confirm()}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
              {!isReadOnly ? (
                <span className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon-touch"
                    variant="ghost"
                    aria-label={m.cycle_review_edit_time_block({
                      label: eventTimeBlock.label,
                    })}
                    onClick={() =>
                      onEditEventTimeBlockRequest({
                        parentId: row.eventId,
                        eventTimeBlockId: eventTimeBlock.eventTimeBlockId,
                        label: eventTimeBlock.label,
                        startTime: eventTimeBlock.startTime,
                        endTime: eventTimeBlock.endTime,
                      })
                    }
                  >
                    <Pencil className="size-3.5" />
                  </Button>
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
