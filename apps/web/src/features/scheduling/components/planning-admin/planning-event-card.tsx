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
  eventSpanLabel,
  eventStatusBadgeVariant,
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
import { formatDayOf, formatInstantRangeOf } from '@/shared/utils/church-time';

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
  | { kind: 'slot'; eventTimeBlockId: string };

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
        current.kind === 'slot' ? { kind: 'none' } : current,
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
          <div className="text-muted-foreground text-xs">
            {formatDayOf({ value: row.start, timeZone: churchTimezone })}
          </div>
          <div className="text-muted-foreground text-xs">
            {eventSpanLabel({
              start: row.start,
              end: row.end,
              timeZone: churchTimezone,
            })}{' '}
            · {row.slots.length} slot
            {row.slots.length === 1 ? '' : 's'}
          </div>
        </div>
        <Badge variant={eventStatusBadgeVariant({ status: row.status })}>
          {row.status}
        </Badge>
      </div>

      {!isReadOnly ? (
        <div className="mt-3 flex items-center gap-1">
          <Button
            type="button"
            size="touch"
            variant="ghost"
            aria-label={`Add slot to ${row.title}`}
            onClick={() => onAddEventTimeBlockRequest({ row })}
          >
            <Plus className="size-3.5" /> Add slot
          </Button>
          <Button
            type="button"
            size="touch"
            variant="ghost"
            aria-label={`Edit day ${row.title}`}
            onClick={() => onEditEventRequest({ row })}
          >
            <Pencil className="size-3.5" /> Edit
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
                  aria-label={`Delete day ${row.title}`}
                >
                  <Trash2 className="size-3.5" /> Delete
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this day?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes "{row.title}" and its slots from the cycle.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteEventPending}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={deleteEventPending}
                  onClick={() => onDeleteEventConfirm({ eventId: row.eventId })}
                >
                  {deleteEventPending ? 'Deleting…' : 'Delete event'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : null}

      {row.slots.length > 0 ? (
        <ul className="mt-3 space-y-2 text-muted-foreground text-xs">
          {row.slots.map((slot) => (
            <li
              key={slot.eventTimeBlockId}
              data-testid="planning-event-time-block-item"
              className="flex items-center justify-between gap-2"
            >
              <span>
                <span>{slot.label}</span> ·{' '}
                <span>
                  {formatInstantRangeOf({
                    start: slot.startTime,
                    end: slot.endTime,
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
                    aria-label={`Edit slot ${slot.label}`}
                    onClick={() =>
                      onEditEventTimeBlockRequest({
                        parentId: row.eventId,
                        eventTimeBlockId: slot.eventTimeBlockId,
                        label: slot.label,
                        startTime: slot.startTime,
                        endTime: slot.endTime,
                      })
                    }
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  {slot.isOnlyEventTimeBlockInEvent ? (
                    <Button
                      type="button"
                      size="icon-touch"
                      variant="destructive"
                      disabled
                      aria-label={`Delete slot ${slot.label}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  ) : (
                    <AlertDialog
                      open={
                        confirmState.kind === 'slot' &&
                        confirmState.eventTimeBlockId === slot.eventTimeBlockId
                      }
                      onOpenChange={(open) =>
                        setConfirmState(
                          open
                            ? {
                                kind: 'slot',
                                eventTimeBlockId: slot.eventTimeBlockId,
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
                            aria-label={`Delete slot ${slot.label}`}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        }
                      />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this slot?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This removes "{slot.label}" from the day.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel
                            disabled={deleteEventTimeBlockPending}
                          >
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            disabled={deleteEventTimeBlockPending}
                            onClick={() =>
                              onDeleteEventTimeBlockConfirm({
                                eventId: row.eventId,
                                eventTimeBlockId: slot.eventTimeBlockId,
                              })
                            }
                          >
                            {deleteEventTimeBlockPending
                              ? 'Deleting…'
                              : 'Delete slot'}
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
