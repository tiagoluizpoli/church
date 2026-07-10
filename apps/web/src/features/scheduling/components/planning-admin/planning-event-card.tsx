import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  ConfirmDeleteEventInput,
  ConfirmDeleteSlotInput,
  StartCreateSlotInput,
  StartEditEventInput,
  StartEditSlotInput,
} from './calendar-row';
import type { CycleCalendarTableRow } from './planning-admin.types';
import { eventStatusBadgeVariant } from './planning-admin.utils';
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

export interface PlanningEventCardProps {
  row: CycleCalendarTableRow;
  isReadOnly: boolean;
  deleteEventPending: boolean;
  deleteSlotPending: boolean;
  onAddSlotRequest: (input: StartCreateSlotInput) => void;
  onEditEventRequest: (input: StartEditEventInput) => void;
  onDeleteEventConfirm: (input: ConfirmDeleteEventInput) => void;
  onEditSlotRequest: (input: StartEditSlotInput) => void;
  onDeleteSlotConfirm: (input: ConfirmDeleteSlotInput) => void;
}

/** Which delete-confirm dialog (if any) is open on this card — kept local
 * rather than shared with the desktop table's `dialogState`, since both
 * surfaces render unconditionally (only CSS-hidden per breakpoint) and a
 * shared boolean would pop both surfaces' confirm dialogs open at once. */
type ConfirmState =
  | { kind: 'none' }
  | { kind: 'event' }
  | { kind: 'slot'; slotId: string };

export function PlanningEventCard({
  row,
  isReadOnly,
  deleteEventPending,
  deleteSlotPending,
  onAddSlotRequest,
  onEditEventRequest,
  onDeleteEventConfirm,
  onEditSlotRequest,
  onDeleteSlotConfirm,
}: PlanningEventCardProps) {
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    kind: 'none',
  });
  const { format } = useTimezone();

  /** Auto-close the confirm dialog on the falling edge of pending (mutation
   * settled) instead of synchronously in the click handler — otherwise the
   * dialog disappears before `deleteEventPending`/`deleteSlotPending` ever
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

  const prevDeleteSlotPendingRef = useRef(deleteSlotPending);
  useEffect(() => {
    if (prevDeleteSlotPendingRef.current && !deleteSlotPending) {
      setConfirmState((current) =>
        current.kind === 'slot' ? { kind: 'none' } : current,
      );
    }
    prevDeleteSlotPendingRef.current = deleteSlotPending;
  }, [deleteSlotPending]);

  return (
    <div
      className="surface-subtle workspace-panel"
      data-testid="planning-event-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="font-medium text-base">{row.title}</div>
          <div className="text-muted-foreground text-xs">
            {format(row.startDate, 'PP')}
          </div>
          <div className="text-muted-foreground text-xs">
            {row.eventType} · {row.slots.length} slot
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
            onClick={() => onAddSlotRequest({ row })}
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
              key={slot.slotId}
              data-testid="planning-slot-item"
              className="flex items-center justify-between gap-2"
            >
              <span>
                <span>{slot.label}</span> ·{' '}
                <span>
                  {format(slot.startTime, 'p')} – {format(slot.endTime, 'p')}
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
                      onEditSlotRequest({
                        parentId: row.eventId,
                        slotId: slot.slotId,
                        label: slot.label,
                        startTime: slot.startTime,
                        endTime: slot.endTime,
                      })
                    }
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  {slot.isOnlySlotInEvent ? (
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
                        confirmState.slotId === slot.slotId
                      }
                      onOpenChange={(open) =>
                        setConfirmState(
                          open
                            ? { kind: 'slot', slotId: slot.slotId }
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
                          <AlertDialogCancel disabled={deleteSlotPending}>
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            disabled={deleteSlotPending}
                            onClick={() =>
                              onDeleteSlotConfirm({
                                eventId: row.eventId,
                                slotId: slot.slotId,
                              })
                            }
                          >
                            {deleteSlotPending ? 'Deleting…' : 'Delete slot'}
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
