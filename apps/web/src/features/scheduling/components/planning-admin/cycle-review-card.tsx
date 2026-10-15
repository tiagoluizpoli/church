import { parseInstant, parseTimeOfDay, today, toInstant } from '@church/time';
import { useEffect, useReducer, useRef, useState } from 'react';
import { QuickCreateEventModal } from '../quick-create-event-modal';
import {
  buildVisibleCalendarRows,
  CALENDAR_TABLE_COLUMNS,
  type CalendarVisibleRow,
  calendarRowEventId,
  calendarRowKey,
  renderCalendarCell,
  type StartCreateEventTimeBlockInput,
  type StartEditEventInput,
  type StartEditEventTimeBlockInput,
  type ToggleEventExpandedInput,
  visibleRowId,
} from './calendar-row';
import { CreateEventTimeBlockDialog } from './create-event-time-block-dialog';
import { EditEventDialog } from './edit-event-dialog';
import { EditEventTimeBlockDialog } from './edit-event-time-block-dialog';
import type {
  CreatingEventTimeBlockState,
  CycleCalendarTableRow,
  EditingEventState,
  EditingEventTimeBlockState,
  ExpandedCalendarRowsState,
} from './planning-admin.types';
import {
  isMultiDayEvent,
  shiftedEnd,
  toCycleCalendarTableRow,
} from './planning-admin.utils';
import { useCycleReviewCard } from './planning-admin-context';
import { PlanningEventCard } from './planning-event-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { useTimezone } from '@/shared/hooks/use-timezone';

interface CycleReviewCardProps {
  isReadOnly: boolean;
}

const DEFAULT_EVENT_TIME_BLOCK_START_TIME = parseTimeOfDay({ value: '09:00' });
const DEFAULT_EVENT_TIME_BLOCK_END_TIME = parseTimeOfDay({ value: '10:00' });

type DialogState =
  | { kind: 'none' }
  | { kind: 'edit-event'; event: EditingEventState }
  | { kind: 'edit-event-time-block'; slot: EditingEventTimeBlockState }
  | { kind: 'create-event-time-block'; slot: CreatingEventTimeBlockState }
  | { kind: 'confirm-delete-event'; eventId: string }
  | { kind: 'confirm-delete-event-time-block'; eventTimeBlockId: string };

type DialogAction =
  | { type: 'edit-event'; event: EditingEventState }
  | { type: 'edit-event-time-block'; slot: EditingEventTimeBlockState }
  | { type: 'create-event-time-block'; slot: CreatingEventTimeBlockState }
  | { type: 'confirm-delete-event'; eventId: string }
  | { type: 'confirm-delete-event-time-block'; eventTimeBlockId: string }
  | { type: 'update-edit-event'; event: EditingEventState }
  | { type: 'update-edit-event-time-block'; slot: EditingEventTimeBlockState }
  | {
      type: 'update-create-event-time-block';
      slot: CreatingEventTimeBlockState;
    }
  | { type: 'close' };

/** The five dialog/confirmation `useState` calls this card used to carry
 * (`editingEvent`/`editingEventTimeBlock`/`creatingEventTimeBlock`/`confirmDeleteEventId`/
 * `confirmDeleteEventTimeBlockId`) modeled one mutually-exclusive "which dialog is
 * open" concept — nothing stopped two being non-null at once. This
 * discriminated-union reducer makes that exclusivity structural. */
function dialogReducer(state: DialogState, action: DialogAction): DialogState {
  switch (action.type) {
    case 'edit-event':
      return { kind: 'edit-event', event: action.event };
    case 'edit-event-time-block':
      return { kind: 'edit-event-time-block', slot: action.slot };
    case 'create-event-time-block':
      return { kind: 'create-event-time-block', slot: action.slot };
    case 'confirm-delete-event':
      return { kind: 'confirm-delete-event', eventId: action.eventId };
    case 'confirm-delete-event-time-block':
      return {
        kind: 'confirm-delete-event-time-block',
        eventTimeBlockId: action.eventTimeBlockId,
      };
    case 'update-edit-event':
      return state.kind === 'edit-event'
        ? { kind: 'edit-event', event: action.event }
        : state;
    case 'update-edit-event-time-block':
      return state.kind === 'edit-event-time-block'
        ? { kind: 'edit-event-time-block', slot: action.slot }
        : state;
    case 'update-create-event-time-block':
      return state.kind === 'create-event-time-block'
        ? { kind: 'create-event-time-block', slot: action.slot }
        : state;
    case 'close':
      return { kind: 'none' };
    default:
      return state;
  }
}

interface IsConfirmingDeleteEventInput {
  dialogState: DialogState;
  eventId: string;
}

function isConfirmingDeleteEvent({
  dialogState,
  eventId,
}: IsConfirmingDeleteEventInput): boolean {
  return (
    dialogState.kind === 'confirm-delete-event' &&
    dialogState.eventId === eventId
  );
}

interface IsConfirmingDeleteEventTimeBlockInput {
  dialogState: DialogState;
  eventTimeBlockId: string;
}

function isConfirmingDeleteEventTimeBlock({
  dialogState,
  eventTimeBlockId,
}: IsConfirmingDeleteEventTimeBlockInput): boolean {
  return (
    dialogState.kind === 'confirm-delete-event-time-block' &&
    dialogState.eventTimeBlockId === eventTimeBlockId
  );
}

export function CycleReviewCard({ isReadOnly }: CycleReviewCardProps) {
  const {
    selectedCycleId,
    selectedCycle,
    cycleDetailsLoading,
    cycleEvents,
    sendCyclePending,
    handleSendCycle,
    updateEventPending,
    deleteEventPending,
    handleUpdateEvent,
    handleDeleteEvent,
    createEventTimeBlockPending,
    updateEventTimeBlockPending,
    deleteEventTimeBlockPending,
    handleCreateEventTimeBlock,
    handleUpdateEventTimeBlock,
    handleDeleteEventTimeBlock,
  } = useCycleReviewCard();
  const { churchTimezone } = useTimezone();
  const [calendarRowsState, setCalendarRowsState] =
    useState<ExpandedCalendarRowsState>({ expandedEventIds: new Set() });
  const [dialogState, dispatchDialog] = useReducer(dialogReducer, {
    kind: 'none',
  });
  const [addEventOpen, setAddEventOpen] = useState(false);

  /** Auto-close the confirm-delete dialog on the falling edge of pending
   * (mutation settled) instead of synchronously in the confirm handler —
   * otherwise the dialog disappears before `deleteEventPending`/
   * `deleteEventTimeBlockPending` ever gets a chance to render, leaving no visible
   * feedback during the delete (mirrors the same fix in PlanningEventCard,
   * the mobile fork of this same delete flow). */
  const prevDeleteEventPendingRef = useRef(deleteEventPending);
  useEffect(() => {
    if (
      prevDeleteEventPendingRef.current &&
      !deleteEventPending &&
      dialogState.kind === 'confirm-delete-event'
    ) {
      dispatchDialog({ type: 'close' });
    }
    prevDeleteEventPendingRef.current = deleteEventPending;
  }, [deleteEventPending, dialogState]);

  const prevDeleteEventTimeBlockPendingRef = useRef(
    deleteEventTimeBlockPending,
  );
  useEffect(() => {
    if (
      prevDeleteEventTimeBlockPendingRef.current &&
      !deleteEventTimeBlockPending &&
      dialogState.kind === 'confirm-delete-event-time-block'
    ) {
      dispatchDialog({ type: 'close' });
    }
    prevDeleteEventTimeBlockPendingRef.current = deleteEventTimeBlockPending;
  }, [deleteEventTimeBlockPending, dialogState]);

  /** Same falling-edge-of-pending close as the delete dialogs above, applied
   * to edit/create — closing synchronously in the submit handler let the
   * dialog report success before the mutation (and its cache invalidation)
   * had actually settled, so a sent-cycle rejection or a slow request left
   * the table showing stale data with no visible link between the closed
   * dialog and the eventual toast. */
  const prevUpdateEventPendingRef = useRef(updateEventPending);
  useEffect(() => {
    if (
      prevUpdateEventPendingRef.current &&
      !updateEventPending &&
      dialogState.kind === 'edit-event'
    ) {
      dispatchDialog({ type: 'close' });
    }
    prevUpdateEventPendingRef.current = updateEventPending;
  }, [updateEventPending, dialogState]);

  const prevUpdateEventTimeBlockPendingRef = useRef(
    updateEventTimeBlockPending,
  );
  useEffect(() => {
    if (
      prevUpdateEventTimeBlockPendingRef.current &&
      !updateEventTimeBlockPending &&
      dialogState.kind === 'edit-event-time-block'
    ) {
      dispatchDialog({ type: 'close' });
    }
    prevUpdateEventTimeBlockPendingRef.current = updateEventTimeBlockPending;
  }, [updateEventTimeBlockPending, dialogState]);

  const prevCreateEventTimeBlockPendingRef = useRef(
    createEventTimeBlockPending,
  );
  useEffect(() => {
    if (
      prevCreateEventTimeBlockPendingRef.current &&
      !createEventTimeBlockPending &&
      dialogState.kind === 'create-event-time-block'
    ) {
      dispatchDialog({ type: 'close' });
    }
    prevCreateEventTimeBlockPendingRef.current = createEventTimeBlockPending;
  }, [createEventTimeBlockPending, dialogState]);

  const editingEvent =
    dialogState.kind === 'edit-event' ? dialogState.event : null;
  const editingEventTimeBlock =
    dialogState.kind === 'edit-event-time-block' ? dialogState.slot : null;
  const creatingEventTimeBlock =
    dialogState.kind === 'create-event-time-block' ? dialogState.slot : null;

  function toggleEventExpanded({ eventId }: ToggleEventExpandedInput): void {
    setCalendarRowsState((current) => {
      const next = new Set(current.expandedEventIds);

      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }

      return { expandedEventIds: next };
    });
  }

  function expandAll(): void {
    setCalendarRowsState({
      expandedEventIds: new Set(
        cycleEvents.map((eventGroup) => eventGroup.event.id),
      ),
    });
  }

  function collapseAll(): void {
    setCalendarRowsState({ expandedEventIds: new Set() });
  }

  function startEditEvent({ row }: StartEditEventInput): void {
    const source = cycleEvents.find(
      (eventGroup) => eventGroup.event.id === row.eventId,
    );

    if (!source) return;

    dispatchDialog({
      type: 'edit-event',
      event: {
        eventId: row.eventId,
        title: row.title,
        description: source.event.description ?? '',
        location: source.event.location ?? '',
        start: parseInstant({ value: row.start }),
        originalStart: source.event.start,
        originalEnd: source.event.end,
      },
    });
  }

  function submitEditEvent(): void {
    if (dialogState.kind !== 'edit-event') return;
    const { event } = dialogState;

    handleUpdateEvent({
      eventId: event.eventId,
      title: event.title,
      description: event.description || undefined,
      location: event.location || undefined,
      start: event.start,
      end: shiftedEnd({
        newStart: event.start,
        originalStart: event.originalStart,
        originalEnd: event.originalEnd,
      }),
    });
  }

  function startEditEventTimeBlock({
    parentId,
    eventTimeBlockId,
    label,
    startTime,
    endTime,
  }: StartEditEventTimeBlockInput): void {
    const source = cycleEvents.find(
      (eventGroup) => eventGroup.event.id === parentId,
    );

    if (!source) return;

    dispatchDialog({
      type: 'edit-event-time-block',
      slot: {
        eventId: parentId,
        eventTimeBlockId,
        label,
        start: parseInstant({ value: startTime }),
        end: parseInstant({ value: endTime }),
        isMultiDayEvent: isMultiDayEvent({
          eventStart: source.event.start,
          eventEnd: source.event.end,
        }),
      },
    });
  }

  function submitEditEventTimeBlock(): void {
    if (dialogState.kind !== 'edit-event-time-block') return;
    const { slot } = dialogState;

    handleUpdateEventTimeBlock({
      eventId: slot.eventId,
      eventTimeBlockId: slot.eventTimeBlockId,
      label: slot.label,
      startTime: slot.start,
      endTime: slot.end,
    });
  }

  function startCreateEventTimeBlock({
    row,
  }: StartCreateEventTimeBlockInput): void {
    const source = cycleEvents.find(
      (eventGroup) => eventGroup.event.id === row.eventId,
    );

    if (!source) return;

    const day = today({
      instant: parseInstant({ value: row.start }),
      timeZone: churchTimezone,
    });

    dispatchDialog({
      type: 'create-event-time-block',
      slot: {
        eventId: row.eventId,
        label: '',
        start: toInstant({
          day,
          time: DEFAULT_EVENT_TIME_BLOCK_START_TIME,
          timeZone: churchTimezone,
        }),
        end: toInstant({
          day,
          time: DEFAULT_EVENT_TIME_BLOCK_END_TIME,
          timeZone: churchTimezone,
        }),
        isMultiDayEvent: isMultiDayEvent({
          eventStart: source.event.start,
          eventEnd: source.event.end,
        }),
      },
    });
  }

  function submitCreateEventTimeBlock(): void {
    if (dialogState.kind !== 'create-event-time-block') return;
    const { slot } = dialogState;

    handleCreateEventTimeBlock({
      eventId: slot.eventId,
      label: slot.label || undefined,
      startTime: slot.start,
      endTime: slot.end,
    });
  }

  const visibleCalendarRows = buildVisibleCalendarRows({
    rows: cycleEvents.map(
      (eventGroup): CycleCalendarTableRow =>
        toCycleCalendarTableRow({ eventGroup }),
    ),
    expandedEventIds: calendarRowsState.expandedEventIds,
  });

  return (
    <Card className="surface-panel">
      <CardContent className="space-y-4">
        {!selectedCycleId ? (
          <p className="text-muted-foreground text-sm">
            Select or create a cycle to continue.
          </p>
        ) : cycleDetailsLoading ? (
          <p className="text-muted-foreground text-sm">
            Loading cycle details…
          </p>
        ) : selectedCycle ? (
          <div className="space-y-3">
            {isReadOnly ? (
              <div className="font-medium text-sm">Calendar review</div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-sm">Calendar review</div>
                  <div className="text-muted-foreground text-xs">
                    Confirm dates, slots, and event types before sending the
                    package.
                  </div>
                </div>
                <Button
                  type="button"
                  data-testid="send-cycle-button"
                  disabled={sendCyclePending}
                  onClick={handleSendCycle}
                >
                  {sendCyclePending ? 'Sending…' : 'Send to Ministries'}
                </Button>
              </div>
            )}

            {cycleEvents.length > 0 ? (
              <>
                <div className="hidden md:block">
                  <div className="mb-2 flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={expandAll}>
                      Expand all
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={collapseAll}
                    >
                      Collapse all
                    </Button>
                  </div>
                </div>

                <DataTable<CalendarVisibleRow>
                  aria-label="Calendar review"
                  columns={CALENDAR_TABLE_COLUMNS}
                  items={visibleCalendarRows}
                  mobileItems={visibleCalendarRows.filter(
                    (row) => row.kind === 'parent',
                  )}
                  mobileListTestId="planning-events-list"
                  mobileListHeader={
                    !isReadOnly ? (
                      <Button
                        type="button"
                        size="touch"
                        variant="outline"
                        onClick={() => setAddEventOpen(true)}
                      >
                        Add day-event
                      </Button>
                    ) : null
                  }
                  rowId={({ item }) => visibleRowId({ visibleRow: item })}
                  rowKey={({ item }) =>
                    calendarRowKey({
                      visibleRow: item,
                      isExpanded: calendarRowsState.expandedEventIds.has(
                        calendarRowEventId({ visibleRow: item }),
                      ),
                      isConfirmingDeleteEvent: isConfirmingDeleteEvent({
                        dialogState,
                        eventId: calendarRowEventId({ visibleRow: item }),
                      }),
                      isConfirmingDeleteEventTimeBlock:
                        item.kind === 'slot' &&
                        isConfirmingDeleteEventTimeBlock({
                          dialogState,
                          eventTimeBlockId: item.eventTimeBlockId,
                        }),
                      deleteEventPending,
                      deleteEventTimeBlockPending,
                    })
                  }
                  renderCell={({ item, column }) =>
                    renderCalendarCell({
                      item,
                      column,
                      isExpanded: calendarRowsState.expandedEventIds.has(
                        calendarRowEventId({ visibleRow: item }),
                      ),
                      isReadOnly,
                      isConfirmingDeleteEvent: isConfirmingDeleteEvent({
                        dialogState,
                        eventId: calendarRowEventId({ visibleRow: item }),
                      }),
                      isConfirmingDeleteEventTimeBlock:
                        item.kind === 'slot' &&
                        isConfirmingDeleteEventTimeBlock({
                          dialogState,
                          eventTimeBlockId: item.eventTimeBlockId,
                        }),
                      deleteEventPending,
                      deleteEventTimeBlockPending,
                      timeZone: churchTimezone,
                      onToggleExpand: toggleEventExpanded,
                      onAddEventTimeBlockRequest: startCreateEventTimeBlock,
                      onEditEventRequest: startEditEvent,
                      onDeleteEventOpenChange: ({ eventId, open }) =>
                        dispatchDialog(
                          open
                            ? { type: 'confirm-delete-event', eventId }
                            : { type: 'close' },
                        ),
                      onDeleteEventConfirm: ({ eventId }) =>
                        handleDeleteEvent({ eventId }),
                      onEditEventTimeBlockRequest: startEditEventTimeBlock,
                      onDeleteEventTimeBlockOpenChange: ({
                        eventTimeBlockId,
                        open,
                      }) =>
                        dispatchDialog(
                          open
                            ? {
                                type: 'confirm-delete-event-time-block',
                                eventTimeBlockId,
                              }
                            : { type: 'close' },
                        ),
                      onDeleteEventTimeBlockConfirm: ({
                        eventId,
                        eventTimeBlockId,
                      }) =>
                        handleDeleteEventTimeBlock({
                          eventId,
                          eventTimeBlockId,
                        }),
                    })
                  }
                  renderMobileCard={({ item }) =>
                    item.kind === 'parent' ? (
                      <PlanningEventCard
                        row={item.row}
                        isReadOnly={isReadOnly}
                        deleteEventPending={deleteEventPending}
                        deleteEventTimeBlockPending={
                          deleteEventTimeBlockPending
                        }
                        onAddEventTimeBlockRequest={startCreateEventTimeBlock}
                        onEditEventRequest={startEditEvent}
                        onDeleteEventConfirm={handleDeleteEvent}
                        onEditEventTimeBlockRequest={startEditEventTimeBlock}
                        onDeleteEventTimeBlockConfirm={
                          handleDeleteEventTimeBlock
                        }
                      />
                    ) : null
                  }
                />
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                No events in this cycle yet. Apply templates or add a manual
                event.
              </p>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Pick a cycle to review its generated calendar.
          </p>
        )}
      </CardContent>

      <EditEventDialog
        editingEvent={editingEvent}
        updateEventPending={updateEventPending}
        timeZone={churchTimezone}
        onChange={(event) =>
          dispatchDialog({ type: 'update-edit-event', event })
        }
        onOpenChange={(open) => {
          if (!open) dispatchDialog({ type: 'close' });
        }}
        onSubmit={submitEditEvent}
      />

      <EditEventTimeBlockDialog
        editingEventTimeBlock={editingEventTimeBlock}
        updateEventTimeBlockPending={updateEventTimeBlockPending}
        timeZone={churchTimezone}
        onChange={(slot) =>
          dispatchDialog({ type: 'update-edit-event-time-block', slot })
        }
        onOpenChange={(open) => {
          if (!open) dispatchDialog({ type: 'close' });
        }}
        onSubmit={submitEditEventTimeBlock}
      />

      <CreateEventTimeBlockDialog
        creatingEventTimeBlock={creatingEventTimeBlock}
        createEventTimeBlockPending={createEventTimeBlockPending}
        timeZone={churchTimezone}
        onChange={(slot) =>
          dispatchDialog({ type: 'update-create-event-time-block', slot })
        }
        onOpenChange={(open) => {
          if (!open) dispatchDialog({ type: 'close' });
        }}
        onSubmit={submitCreateEventTimeBlock}
      />

      {selectedCycleId ? (
        <QuickCreateEventModal
          open={addEventOpen}
          onOpenChange={setAddEventOpen}
          cycleId={selectedCycleId}
          onCreated={() => undefined}
        />
      ) : null}
    </Card>
  );
}
