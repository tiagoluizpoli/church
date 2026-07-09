import { useReducer, useState } from 'react';
import {
  buildVisibleCalendarRows,
  CALENDAR_TABLE_COLUMNS,
  CalendarRow,
  type StartCreateSlotInput,
  type StartEditEventInput,
  type StartEditSlotInput,
  type ToggleEventExpandedInput,
  visibleRowId,
} from './calendar-row';
import { CreateSlotDialog } from './create-slot-dialog';
import { EditEventDialog } from './edit-event-dialog';
import { EditSlotDialog } from './edit-slot-dialog';
import type {
  CreatingSlotState,
  CycleCalendarTableRow,
  EditingEventState,
  EditingSlotState,
  ExpandedCalendarRowsState,
} from './planning-admin.types';
import {
  fromDateTimeLocalValue,
  isMultiDayEvent,
  shiftedEndDate,
  toCycleCalendarTableRow,
  toDateTimeLocalValue,
} from './planning-admin.utils';
import { useCycleReviewCard } from './planning-admin-context';
import { PlanningEventCard } from './planning-event-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableColumn,
  TableHeader,
} from '@/components/ui/table';
import { useTimezone } from '@/shared/hooks/use-timezone';

interface CycleReviewCardProps {
  isReadOnly: boolean;
}

const DEFAULT_SLOT_START_TIME = '09:00';
const DEFAULT_SLOT_END_TIME = '10:00';

type DialogState =
  | { kind: 'none' }
  | { kind: 'edit-event'; event: EditingEventState }
  | { kind: 'edit-slot'; slot: EditingSlotState }
  | { kind: 'create-slot'; slot: CreatingSlotState }
  | { kind: 'confirm-delete-event'; eventId: string }
  | { kind: 'confirm-delete-slot'; slotId: string };

type DialogAction =
  | { type: 'edit-event'; event: EditingEventState }
  | { type: 'edit-slot'; slot: EditingSlotState }
  | { type: 'create-slot'; slot: CreatingSlotState }
  | { type: 'confirm-delete-event'; eventId: string }
  | { type: 'confirm-delete-slot'; slotId: string }
  | { type: 'update-edit-event'; event: EditingEventState }
  | { type: 'update-edit-slot'; slot: EditingSlotState }
  | { type: 'update-create-slot'; slot: CreatingSlotState }
  | { type: 'close' };

/** The five dialog/confirmation `useState` calls this card used to carry
 * (`editingEvent`/`editingSlot`/`creatingSlot`/`confirmDeleteEventId`/
 * `confirmDeleteSlotId`) modeled one mutually-exclusive "which dialog is
 * open" concept — nothing stopped two being non-null at once. This
 * discriminated-union reducer makes that exclusivity structural. */
function dialogReducer(state: DialogState, action: DialogAction): DialogState {
  switch (action.type) {
    case 'edit-event':
      return { kind: 'edit-event', event: action.event };
    case 'edit-slot':
      return { kind: 'edit-slot', slot: action.slot };
    case 'create-slot':
      return { kind: 'create-slot', slot: action.slot };
    case 'confirm-delete-event':
      return { kind: 'confirm-delete-event', eventId: action.eventId };
    case 'confirm-delete-slot':
      return { kind: 'confirm-delete-slot', slotId: action.slotId };
    case 'update-edit-event':
      return state.kind === 'edit-event'
        ? { kind: 'edit-event', event: action.event }
        : state;
    case 'update-edit-slot':
      return state.kind === 'edit-slot'
        ? { kind: 'edit-slot', slot: action.slot }
        : state;
    case 'update-create-slot':
      return state.kind === 'create-slot'
        ? { kind: 'create-slot', slot: action.slot }
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

interface IsConfirmingDeleteSlotInput {
  dialogState: DialogState;
  slotId: string;
}

function isConfirmingDeleteSlot({
  dialogState,
  slotId,
}: IsConfirmingDeleteSlotInput): boolean {
  return (
    dialogState.kind === 'confirm-delete-slot' && dialogState.slotId === slotId
  );
}

export function CycleReviewCard({ isReadOnly }: CycleReviewCardProps) {
  const {
    selectedCycleId,
    selectedCycle,
    cycleDetailsLoading,
    cycleEvents,
    lockCyclePending,
    handleLockCycle,
    updateEventPending,
    deleteEventPending,
    handleUpdateEvent,
    handleDeleteEvent,
    createSlotPending,
    updateSlotPending,
    deleteSlotPending,
    handleCreateSlot,
    handleUpdateSlot,
    handleDeleteSlot,
  } = useCycleReviewCard();
  const { format } = useTimezone();
  const [calendarRowsState, setCalendarRowsState] =
    useState<ExpandedCalendarRowsState>({ expandedEventIds: new Set() });
  const [dialogState, dispatchDialog] = useReducer(dialogReducer, {
    kind: 'none',
  });

  const editingEvent =
    dialogState.kind === 'edit-event' ? dialogState.event : null;
  const editingSlot =
    dialogState.kind === 'edit-slot' ? dialogState.slot : null;
  const creatingSlot =
    dialogState.kind === 'create-slot' ? dialogState.slot : null;

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
        startDateTimeLocal: toDateTimeLocalValue({ iso: row.startDate }),
        originalStartDate: source.event.startDate,
        originalEndDate: source.event.endDate,
      },
    });
  }

  function submitEditEvent(): void {
    if (dialogState.kind !== 'edit-event') return;
    const { event } = dialogState;
    const newStartDate = fromDateTimeLocalValue({
      value: event.startDateTimeLocal,
    });

    handleUpdateEvent({
      eventId: event.eventId,
      title: event.title,
      description: event.description || undefined,
      location: event.location || undefined,
      startDate: newStartDate,
      endDate: shiftedEndDate({
        newStartDate,
        originalStartDate: event.originalStartDate,
        originalEndDate: event.originalEndDate,
      }),
    });
    dispatchDialog({ type: 'close' });
  }

  function startEditSlot({
    parentId,
    slotId,
    label,
    startTime,
    endTime,
  }: StartEditSlotInput): void {
    const source = cycleEvents.find(
      (eventGroup) => eventGroup.event.id === parentId,
    );

    if (!source) return;

    dispatchDialog({
      type: 'edit-slot',
      slot: {
        eventId: parentId,
        slotId,
        label,
        startTimeLocal: toDateTimeLocalValue({ iso: startTime }),
        endTimeLocal: toDateTimeLocalValue({ iso: endTime }),
        isMultiDayEvent: isMultiDayEvent({
          startDate: source.event.startDate,
          endDate: source.event.endDate,
        }),
      },
    });
  }

  function submitEditSlot(): void {
    if (dialogState.kind !== 'edit-slot') return;
    const { slot } = dialogState;

    handleUpdateSlot({
      eventId: slot.eventId,
      slotId: slot.slotId,
      label: slot.label,
      startTime: fromDateTimeLocalValue({ value: slot.startTimeLocal }),
      endTime: fromDateTimeLocalValue({ value: slot.endTimeLocal }),
    });
    dispatchDialog({ type: 'close' });
  }

  function startCreateSlot({ row }: StartCreateSlotInput): void {
    const source = cycleEvents.find(
      (eventGroup) => eventGroup.event.id === row.eventId,
    );

    if (!source) return;

    const datePart = toDateTimeLocalValue({ iso: row.startDate }).split('T')[0];

    dispatchDialog({
      type: 'create-slot',
      slot: {
        eventId: row.eventId,
        label: '',
        startTimeLocal: `${datePart}T${DEFAULT_SLOT_START_TIME}`,
        endTimeLocal: `${datePart}T${DEFAULT_SLOT_END_TIME}`,
        isMultiDayEvent: isMultiDayEvent({
          startDate: source.event.startDate,
          endDate: source.event.endDate,
        }),
      },
    });
  }

  function submitCreateSlot(): void {
    if (dialogState.kind !== 'create-slot') return;
    const { slot } = dialogState;

    handleCreateSlot({
      eventId: slot.eventId,
      label: slot.label || undefined,
      startTime: fromDateTimeLocalValue({ value: slot.startTimeLocal }),
      endTime: fromDateTimeLocalValue({ value: slot.endTimeLocal }),
    });
    dispatchDialog({ type: 'close' });
  }

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
                    Confirm dates, slots, and event types before locking the
                    package.
                  </div>
                </div>
                <Button
                  type="button"
                  data-testid="lock-cycle-button"
                  disabled={lockCyclePending}
                  onClick={handleLockCycle}
                >
                  {lockCyclePending ? 'Locking…' : 'Lock cycle'}
                </Button>
              </div>
            )}

            {cycleEvents.length > 0 ? (
              <>
                <div
                  className="space-y-3 md:hidden"
                  data-testid="planning-events-list"
                >
                  {cycleEvents.map((eventGroup) => (
                    <PlanningEventCard
                      key={eventGroup.event.id}
                      eventGroup={eventGroup}
                    />
                  ))}
                </div>

                <div className="hidden md:block">
                  <Table aria-label="Calendar review">
                    <TableHeader columns={CALENDAR_TABLE_COLUMNS}>
                      {(column) => (
                        <TableColumn isRowHeader={column.id === 'event'}>
                          {column.name}
                        </TableColumn>
                      )}
                    </TableHeader>
                    <TableBody
                      dependencies={[
                        calendarRowsState,
                        dialogState,
                        isReadOnly,
                        deleteEventPending,
                        deleteSlotPending,
                        cycleEvents,
                      ]}
                      items={buildVisibleCalendarRows({
                        rows: cycleEvents.map(
                          (eventGroup): CycleCalendarTableRow =>
                            toCycleCalendarTableRow({ eventGroup }),
                        ),
                        expandedEventIds: calendarRowsState.expandedEventIds,
                      })}
                    >
                      {(visibleRow) => {
                        const rowEventId =
                          visibleRow.kind === 'parent'
                            ? visibleRow.row.eventId
                            : visibleRow.parentId;

                        return (
                          <CalendarRow
                            key={visibleRowId({ visibleRow })}
                            visibleRow={visibleRow}
                            isExpanded={calendarRowsState.expandedEventIds.has(
                              rowEventId,
                            )}
                            isReadOnly={isReadOnly}
                            isConfirmingDeleteEvent={isConfirmingDeleteEvent({
                              dialogState,
                              eventId: rowEventId,
                            })}
                            isConfirmingDeleteSlot={
                              visibleRow.kind === 'slot' &&
                              isConfirmingDeleteSlot({
                                dialogState,
                                slotId: visibleRow.slotId,
                              })
                            }
                            deleteEventPending={deleteEventPending}
                            deleteSlotPending={deleteSlotPending}
                            format={format}
                            onToggleExpand={toggleEventExpanded}
                            onAddSlotRequest={startCreateSlot}
                            onEditEventRequest={startEditEvent}
                            onDeleteEventOpenChange={({ eventId, open }) =>
                              dispatchDialog(
                                open
                                  ? { type: 'confirm-delete-event', eventId }
                                  : { type: 'close' },
                              )
                            }
                            onDeleteEventConfirm={({ eventId }) => {
                              handleDeleteEvent({ eventId });
                              dispatchDialog({ type: 'close' });
                            }}
                            onEditSlotRequest={startEditSlot}
                            onDeleteSlotOpenChange={({ slotId, open }) =>
                              dispatchDialog(
                                open
                                  ? { type: 'confirm-delete-slot', slotId }
                                  : { type: 'close' },
                              )
                            }
                            onDeleteSlotConfirm={({ eventId, slotId }) => {
                              handleDeleteSlot({ eventId, slotId });
                              dispatchDialog({ type: 'close' });
                            }}
                          />
                        );
                      }}
                    </TableBody>
                  </Table>
                </div>
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
        onChange={(event) =>
          dispatchDialog({ type: 'update-edit-event', event })
        }
        onOpenChange={(open) => {
          if (!open) dispatchDialog({ type: 'close' });
        }}
        onSubmit={submitEditEvent}
      />

      <EditSlotDialog
        editingSlot={editingSlot}
        updateSlotPending={updateSlotPending}
        onChange={(slot) => dispatchDialog({ type: 'update-edit-slot', slot })}
        onOpenChange={(open) => {
          if (!open) dispatchDialog({ type: 'close' });
        }}
        onSubmit={submitEditSlot}
      />

      <CreateSlotDialog
        creatingSlot={creatingSlot}
        createSlotPending={createSlotPending}
        onChange={(slot) =>
          dispatchDialog({ type: 'update-create-slot', slot })
        }
        onOpenChange={(open) => {
          if (!open) dispatchDialog({ type: 'close' });
        }}
        onSubmit={submitCreateSlot}
      />
    </Card>
  );
}
