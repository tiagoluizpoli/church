import { m } from '@church/i18n/messages';
import { useEffect, useReducer, useRef, useState } from 'react';
import {
  buildVisibleCalendarRows,
  type CalendarVisibleRow,
  calendarRowEventId,
  calendarRowKey,
  calendarTableColumns,
  renderCalendarCell,
  type ToggleEventExpandedInput,
  visibleRowId,
  weekLabel,
} from './calendar-row';
import type {
  CycleCalendarTableRow,
  ExpandedCalendarRowsState,
} from './planning-admin.types';
import {
  groupRowsByWeek,
  isNotFoundError,
  toCycleCalendarTableRow,
} from './planning-admin.utils';
import { useCycleReviewCard } from './planning-admin-context';
import { PlanningEventCard } from './planning-event-card';
import { RetryAlert } from './retry-alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { useTimezone } from '@/shared/hooks/use-timezone';

interface CycleReviewCardProps {
  isReadOnly: boolean;
  /** The Cycle id of the route; data for any other Cycle is never shown. */
  cycleId?: string;
  /** A just-saved Event to expand and scroll into view once loaded. */
  revealEventId?: string;
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'confirm-delete-event'; eventId: string }
  | { kind: 'confirm-delete-event-time-block'; eventTimeBlockId: string };

type DialogAction =
  | { type: 'confirm-delete-event'; eventId: string }
  | { type: 'confirm-delete-event-time-block'; eventTimeBlockId: string }
  | { type: 'close' };

/** Which delete confirmation is open: mutually exclusive by construction. */
// named-parameters-ignore: React useReducer calls reducers as (state, action)
function dialogReducer(state: DialogState, action: DialogAction): DialogState {
  switch (action.type) {
    case 'confirm-delete-event':
      return { kind: 'confirm-delete-event', eventId: action.eventId };
    case 'confirm-delete-event-time-block':
      return {
        kind: 'confirm-delete-event-time-block',
        eventTimeBlockId: action.eventTimeBlockId,
      };
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

export function CycleReviewCard({
  isReadOnly,
  cycleId,
  revealEventId,
}: CycleReviewCardProps) {
  const {
    selectedCycleId,
    selectedCycle,
    cycleDetailsLoading,
    cycleDetailsError,
    refetchCycleDetails,
    cycleEvents,
    sendCyclePending,
    handleSendCycle,
    deleteEventPending,
    handleDeleteEvent,
    deleteEventTimeBlockPending,
    handleDeleteEventTimeBlock,
  } = useCycleReviewCard();
  const { churchTimezone } = useTimezone();
  const [calendarRowsState, setCalendarRowsState] =
    useState<ExpandedCalendarRowsState>({ expandedEventIds: new Set() });
  const [dialogState, dispatchDialog] = useReducer(dialogReducer, {
    kind: 'none',
  });
  const revealed = cycleEvents.some(
    (eventGroup) => eventGroup.event.id === revealEventId,
  );

  useEffect(() => {
    if (!revealEventId || !revealed) return;
    setCalendarRowsState((current) => ({
      expandedEventIds: new Set([...current.expandedEventIds, revealEventId]),
    }));
    // Both the table row and its mobile card carry the reveal test id.
    for (const element of document.querySelectorAll(
      '[data-testid="revealed-event-row"]',
    )) {
      element.scrollIntoView?.({ block: 'center' });
    }
  }, [revealEventId, revealed]);

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

  const visibleCalendarRows = buildVisibleCalendarRows({
    weeks: groupRowsByWeek({
      rows: cycleEvents.map(
        (eventGroup): CycleCalendarTableRow =>
          toCycleCalendarTableRow({ eventGroup }),
      ),
      timeZone: churchTimezone,
    }),
    expandedEventIds: calendarRowsState.expandedEventIds,
  });
  const isShowingOtherCycle =
    cycleId !== undefined && selectedCycle?.id !== cycleId;
  const reviewedCycle = isShowingOtherCycle ? null : selectedCycle;

  return (
    <Card className="surface-panel">
      <CardContent className="space-y-4">
        {!selectedCycleId ? (
          <p className="text-muted-foreground text-sm">
            {m.cycle_review_select()}
          </p>
        ) : cycleDetailsError ? (
          isNotFoundError({ error: cycleDetailsError }) ? (
            <p
              className="text-muted-foreground text-sm"
              data-testid="cycle-review-not-found"
            >
              {m.cycle_review_not_found()}
            </p>
          ) : (
            <RetryAlert
              message={m.cycle_review_error()}
              testId="cycle-review-error"
              onRetry={refetchCycleDetails}
            />
          )
        ) : cycleDetailsLoading || !reviewedCycle ? (
          <p
            className="text-muted-foreground text-sm"
            data-testid="cycle-review-loading"
          >
            {m.cycle_review_loading()}
          </p>
        ) : (
          <div className="space-y-3">
            {isReadOnly ? (
              <div className="font-medium text-sm">
                {m.cycle_review_title()}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-sm">
                    {m.cycle_review_title()}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {m.cycle_review_send_hint()}
                  </div>
                </div>
                <Button
                  type="button"
                  data-testid="send-cycle-button"
                  disabled={sendCyclePending}
                  onClick={handleSendCycle}
                >
                  {sendCyclePending
                    ? m.cycle_review_sending()
                    : m.cycle_review_send()}
                </Button>
              </div>
            )}

            {cycleEvents.length > 0 ? (
              <>
                <div className="hidden md:block">
                  <div className="mb-2 flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={expandAll}>
                      {m.cycle_review_expand_all()}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={collapseAll}
                    >
                      {m.cycle_review_collapse_all()}
                    </Button>
                  </div>
                </div>

                <DataTable<CalendarVisibleRow>
                  aria-label={m.cycle_review_title()}
                  columns={calendarTableColumns()}
                  items={visibleCalendarRows}
                  mobileItems={visibleCalendarRows.filter(
                    (row) => row.kind !== 'event-time-block',
                  )}
                  mobileListTestId="planning-events-list"
                  rowTestId={({ item }) =>
                    item.kind === 'parent' && item.row.eventId === revealEventId
                      ? 'revealed-event-row'
                      : undefined
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
                        item.kind === 'event-time-block' &&
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
                      cycleId: reviewedCycle.id,
                      isExpanded: calendarRowsState.expandedEventIds.has(
                        calendarRowEventId({ visibleRow: item }),
                      ),
                      isReadOnly,
                      isConfirmingDeleteEvent: isConfirmingDeleteEvent({
                        dialogState,
                        eventId: calendarRowEventId({ visibleRow: item }),
                      }),
                      isConfirmingDeleteEventTimeBlock:
                        item.kind === 'event-time-block' &&
                        isConfirmingDeleteEventTimeBlock({
                          dialogState,
                          eventTimeBlockId: item.eventTimeBlockId,
                        }),
                      deleteEventPending,
                      deleteEventTimeBlockPending,
                      timeZone: churchTimezone,
                      onToggleExpand: toggleEventExpanded,
                      onDeleteEventOpenChange: ({ eventId, open }) =>
                        dispatchDialog(
                          open
                            ? { type: 'confirm-delete-event', eventId }
                            : { type: 'close' },
                        ),
                      onDeleteEventConfirm: ({ eventId }) =>
                        handleDeleteEvent({ eventId }),
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
                    item.kind === 'week' ? (
                      <h3 className="font-semibold text-sm">
                        {weekLabel(item)}
                      </h3>
                    ) : item.kind === 'parent' ? (
                      <PlanningEventCard
                        row={item.row}
                        cycleId={reviewedCycle.id}
                        isReadOnly={isReadOnly}
                        deleteEventPending={deleteEventPending}
                        deleteEventTimeBlockPending={
                          deleteEventTimeBlockPending
                        }
                        onDeleteEventConfirm={handleDeleteEvent}
                        onDeleteEventTimeBlockConfirm={
                          handleDeleteEventTimeBlock
                        }
                      />
                    ) : null
                  }
                />
              </>
            ) : (
              <p
                className="text-muted-foreground text-sm"
                data-testid="cycle-review-empty"
              >
                {m.cycle_review_empty()}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
