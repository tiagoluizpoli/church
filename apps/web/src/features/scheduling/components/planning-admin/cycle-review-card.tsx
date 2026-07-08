import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { QuickCreateEventModal } from '../quick-create-event-modal';
import type {
  CycleCalendarTableRow,
  ExpandedCalendarRowsState,
} from './planning-admin.types';
import {
  eventStatusBadgeVariant,
  formatCycleDate,
  toCycleCalendarTableRow,
} from './planning-admin.utils';
import { useCycleReviewCard } from './planning-admin-context';
import { PlanningEventCard } from './planning-event-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface CycleReviewCardProps {
  isReadOnly: boolean;
}

const CALENDAR_TABLE_COLUMNS = [
  { id: 'event', name: 'Event' },
  { id: 'window', name: 'Window' },
  { id: 'slots', name: 'Slots' },
  { id: 'status', name: 'Status' },
] as const;

type CalendarVisibleRow =
  | { kind: 'parent'; row: CycleCalendarTableRow }
  | {
      kind: 'slot';
      parentId: string;
      slotId: string;
      label: string;
      window: string;
    };

interface BuildVisibleCalendarRowsInput {
  rows: CycleCalendarTableRow[];
  expandedEventIds: ReadonlySet<string>;
}

function buildVisibleCalendarRows({
  rows,
  expandedEventIds,
}: BuildVisibleCalendarRowsInput): CalendarVisibleRow[] {
  return rows.flatMap((row): CalendarVisibleRow[] => {
    const parentRow: CalendarVisibleRow = { kind: 'parent', row };

    if (!expandedEventIds.has(row.eventId)) {
      return [parentRow];
    }

    return [
      parentRow,
      ...row.slots.map(
        (slot): CalendarVisibleRow => ({
          kind: 'slot',
          parentId: row.eventId,
          slotId: slot.slotId,
          label: slot.label,
          window: slot.window,
        }),
      ),
    ];
  });
}

interface VisibleRowIdInput {
  visibleRow: CalendarVisibleRow;
}

function visibleRowId({ visibleRow }: VisibleRowIdInput): string {
  return visibleRow.kind === 'parent'
    ? `event-${visibleRow.row.eventId}`
    : `slot-${visibleRow.parentId}-${visibleRow.slotId}`;
}

export function CycleReviewCard({ isReadOnly }: CycleReviewCardProps) {
  const {
    selectedCycleId,
    selectedCycle,
    cycleDetailsLoading,
    totalSlots,
    cycleEvents,
    lockCyclePending,
    handleLockCycle,
  } = useCycleReviewCard();
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [calendarRowsState, setCalendarRowsState] =
    useState<ExpandedCalendarRowsState>({ expandedEventIds: new Set() });

  interface ToggleEventExpandedInput {
    eventId: string;
  }

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

  return (
    <Card className="surface-panel">
      <CardHeader>
        <CardTitle>Selected cycle review</CardTitle>
        <CardDescription>
          Add one-off events, review the generated calendar, then lock the cycle
          when leaders can start staffing.
        </CardDescription>
      </CardHeader>
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
          <>
            <div
              className="surface-subtle workspace-panel flex flex-wrap items-center justify-between gap-3"
              data-testid="selected-cycle-summary"
            >
              <div className="space-y-1">
                <div className="font-medium" data-testid="selected-cycle-name">
                  {selectedCycle.name}
                </div>
                <div className="text-muted-foreground text-xs">
                  {formatCycleDate({ date: selectedCycle.startDate })} →{' '}
                  {formatCycleDate({ date: selectedCycle.endDate })}
                </div>
                <div className="text-muted-foreground text-xs">
                  {cycleEvents.length} events · {totalSlots} slots
                </div>
              </div>
            </div>

            {!isReadOnly ? (
              <div className="surface-subtle workspace-panel">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-medium">Manual exceptions</div>
                    <div className="text-muted-foreground text-sm">
                      Add retreats, special services, and other one-off events
                      without leaving the cycle review.
                    </div>
                  </div>
                  <Button
                    type="button"
                    onClick={() => setCreateEventOpen(true)}
                  >
                    Add manual event
                  </Button>
                </div>
                <QuickCreateEventModal
                  open={createEventOpen}
                  onOpenChange={setCreateEventOpen}
                  target={{ kind: 'planning-cycle', cycleId: selectedCycle.id }}
                  onCreated={() => undefined}
                />
              </div>
            ) : null}

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
                        items={buildVisibleCalendarRows({
                          rows: cycleEvents.map((eventGroup) =>
                            toCycleCalendarTableRow({ eventGroup }),
                          ),
                          expandedEventIds: calendarRowsState.expandedEventIds,
                        })}
                      >
                        {(visibleRow) => (
                          <TableRow
                            key={visibleRowId({ visibleRow })}
                            id={visibleRowId({ visibleRow })}
                            columns={CALENDAR_TABLE_COLUMNS}
                          >
                            {(column) => (
                              <TableCell>
                                {visibleRow.kind === 'parent' ? (
                                  <>
                                    {column.id === 'event' ? (
                                      <span className="flex items-center gap-2">
                                        <Button
                                          type="button"
                                          size="icon-xs"
                                          variant="ghost"
                                          aria-label={
                                            calendarRowsState.expandedEventIds.has(
                                              visibleRow.row.eventId,
                                            )
                                              ? `Collapse ${visibleRow.row.title}`
                                              : `Expand ${visibleRow.row.title}`
                                          }
                                          onClick={() =>
                                            toggleEventExpanded({
                                              eventId: visibleRow.row.eventId,
                                            })
                                          }
                                        >
                                          {calendarRowsState.expandedEventIds.has(
                                            visibleRow.row.eventId,
                                          ) ? (
                                            <ChevronDown />
                                          ) : (
                                            <ChevronRight />
                                          )}
                                        </Button>
                                        {visibleRow.row.title}
                                      </span>
                                    ) : null}
                                    {column.id === 'window'
                                      ? visibleRow.row.window
                                      : null}
                                    {column.id === 'slots'
                                      ? `${visibleRow.row.slots.length} slot${visibleRow.row.slots.length === 1 ? '' : 's'}`
                                      : null}
                                    {column.id === 'status' ? (
                                      <Badge
                                        variant={eventStatusBadgeVariant({
                                          status: visibleRow.row.status,
                                        })}
                                      >
                                        {visibleRow.row.status}
                                      </Badge>
                                    ) : null}
                                  </>
                                ) : (
                                  <>
                                    {column.id === 'event' ? (
                                      <span className="pl-8 text-muted-foreground">
                                        {visibleRow.label}
                                      </span>
                                    ) : null}
                                    {column.id === 'window' ? (
                                      <span className="text-muted-foreground">
                                        {visibleRow.window}
                                      </span>
                                    ) : null}
                                  </>
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                        )}
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
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            Pick a cycle to review its generated calendar.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
