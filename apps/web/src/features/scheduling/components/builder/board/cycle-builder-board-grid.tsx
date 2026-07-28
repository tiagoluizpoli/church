import { CalendarDays } from 'lucide-react';
import type { useBoardDragScroll } from '../../../hooks/use-cycle-board-drag-scroll';
import {
  type CycleBuilderData,
  type CycleBuilderEventSummary,
  isActiveAssignment,
} from '../../../hooks/use-cycle-builder';
import type { CellDerived } from '../../../utils/builder/cycle-builder-assignment-index.utils';
import {
  dateLabel,
  eventSlotsOnDay,
  timeLabel,
} from '../../../utils/builder/cycle-builder-date.utils';
import { rankVolunteersForShiftRole } from '../../../utils/builder/cycle-builder-ranking.utils';
import {
  buildFocusLabel,
  type FocusedShift,
  focusKey,
} from '../../../utils/builder/cycle-builder-shift-lookup.utils';
import { staffingStatusClasses } from '../../../utils/builder/cycle-builder-staffing.utils';
import {
  CycleBuilderCell,
  type CycleBuilderCellSelectInput,
} from './cycle-builder-cell';
import type { FailedAssignmentWrite } from './cycle-builder-cell-parts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface BoardEmptyStateProps {
  isFiltered: boolean;
  onClearFilters: () => void;
}

/**
 * Filtering the board down to nothing used to leave one empty 320px column in a
 * 960px scroller, contradicted only by a 12px count at the far end of the
 * toolbar. A large blank rectangle reads as "broken", not as "your filter is
 * too tight" — so the board has to say which of the two it is, and offer the
 * way back when it is the filter.
 */
function BoardEmptyState({ isFiltered, onClearFilters }: BoardEmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center gap-2 px-6 py-12 text-center"
      data-testid="cycle-board-empty"
    >
      <CalendarDays className="size-5 text-muted-foreground" />
      <p className="font-semibold text-foreground text-sm">
        {isFiltered
          ? 'No dates match these filters'
          : 'No dates in this cycle yet'}
      </p>
      <p className="max-w-md text-muted-foreground text-xs">
        {isFiltered
          ? 'Every date is filtered out. Clear the filters to bring the board back.'
          : 'Add events to this cycle and their dates will appear here as columns.'}
      </p>
      {isFiltered ? (
        <Button type="button" variant="outline" onClick={onClearFilters}>
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}

interface CycleBuilderBoardGridProps {
  data: CycleBuilderData;
  columns: string[];
  eventsForDate: Map<string, CycleBuilderEventSummary[]>;
  cellDerivedByKey: Map<string, CellDerived>;
  failedWritesByCell: Map<string, FailedAssignmentWrite[]>;
  selectedVolunteerId?: string;
  selectedVolunteerName?: string;
  focusedKey?: string;
  onFocusRequirement: (focused: FocusedShift) => void;
  onClearFocus: () => void;
  onSelectAssignment: (input: CycleBuilderCellSelectInput) => void;
  onRemoveAssignment: (id: string) => void;
  onRetryFailedWrite?: (failedWriteId: string) => void;
  onDismissFailedWrite?: (failedWriteId: string) => void;
  filtersAreDefault: boolean;
  onClearFilters: () => void;
  dragScroll: ReturnType<typeof useBoardDragScroll>;
}

/**
 * The board's own scroll surface: a grid of date columns, each holding its
 * events → included slots → shifts → role cells. Drag-to-scroll comes from
 * `useBoardDragScroll` (see that hook's doc comment for why it isn't shared
 * with the date strip's). Rendered inside the parent's `DndContext` — cells
 * register their own droppables via `useDroppable`, which works anywhere in
 * the same DnD tree regardless of this component boundary.
 */
export function CycleBuilderBoardGrid({
  data,
  columns,
  eventsForDate,
  cellDerivedByKey,
  failedWritesByCell,
  selectedVolunteerId,
  selectedVolunteerName,
  focusedKey,
  onFocusRequirement,
  onClearFocus,
  onSelectAssignment,
  onRemoveAssignment,
  onRetryFailedWrite,
  onDismissFailedWrite,
  filtersAreDefault,
  onClearFilters,
  dragScroll,
}: CycleBuilderBoardGridProps) {
  const gridStyle = {
    gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(320px, 1fr))`,
  };

  return (
    // 23.75rem = 380px. Widened from 320px so the AE card's three columns each
    // keep their own band instead of the roles line and the recency block
    // fighting for the same width.
    <Card
      className={cn(
        'min-w-0 touch-pan-y border-0 bg-transparent py-0 shadow-none',
      )}
      data-testid="cycle-board-drag-surface"
      onPointerDown={dragScroll.onPointerDown}
      onPointerMove={dragScroll.onPointerMove}
      onPointerUp={dragScroll.onPointerUp}
      onPointerCancel={dragScroll.onPointerCancel}
      onLostPointerCapture={dragScroll.onLostPointerCapture}
      onClickCapture={dragScroll.onClickCapture}
    >
      <CardContent className="workspace-panel">
        <ScrollArea
          className="min-w-0 pb-3"
          data-testid="cycle-board-scroll"
          viewportRef={dragScroll.viewportRef}
          viewportTestId="cycle-board-viewport"
          scrollbarOrientation="horizontal"
        >
          <div className={columns.length > 0 ? 'min-w-[960px]' : ''}>
            {columns.length === 0 ? (
              <BoardEmptyState
                isFiltered={!filtersAreDefault}
                onClearFilters={onClearFilters}
              />
            ) : null}
            <div className="grid items-start gap-3 text-xs" style={gridStyle}>
              {columns.map((date) => (
                <section
                  key={date}
                  className="min-w-0 self-start rounded-md border bg-card"
                >
                  <header className="border-b px-3 py-2">
                    <p className="font-semibold text-foreground text-sm">
                      {dateLabel(date)}
                    </p>
                    <p className="mt-0.5 text-muted-foreground text-xs">
                      {(eventsForDate.get(date) ?? []).length} event
                      {(eventsForDate.get(date) ?? []).length === 1 ? '' : 's'}
                    </p>
                  </header>
                  <div className="space-y-3 p-2">
                    {(eventsForDate.get(date) ?? []).map((event) => (
                      <section key={event.eventId} className="space-y-2">
                        <div className="flex items-center justify-between gap-2 px-1">
                          <h2 className="truncate font-semibold text-foreground text-sm">
                            {event.title}
                          </h2>
                          <Badge
                            variant="outline"
                            data-testid={`cycle-event-staffing-percent-${event.eventId}`}
                            className={cn(
                              'shrink-0',
                              staffingStatusClasses({
                                percent: Math.round(event.fillRatio * 100),
                                hasRequirement: event.requiredCount > 0,
                              }).text,
                            )}
                          >
                            {Math.round(event.fillRatio * 100)}%
                          </Badge>
                        </div>
                        {eventSlotsOnDay({ event, day: date })
                          .filter((slot) => slot.included)
                          .map((slot) => (
                            <section
                              key={slot.slotId}
                              className="space-y-2 rounded-md border border-dashed p-2"
                            >
                              <h3 className="font-medium text-foreground text-xs">
                                {slot.label ?? 'Slot'}
                              </h3>
                              <div className="space-y-2">
                                {slot.shifts.map((shift) => (
                                  <section
                                    key={shift.shiftId}
                                    className="space-y-2 border-t pt-2 first:border-t-0 first:pt-0"
                                  >
                                    <p className="text-muted-foreground text-xs">
                                      {shift.label ??
                                        `${timeLabel(shift.startTime)} – ${timeLabel(shift.endTime)}`}
                                    </p>
                                    <div className="space-y-2">
                                      {shift.requirements.map((requirement) => {
                                        const assignments =
                                          shift.assignments.filter(
                                            (assignment) =>
                                              assignment.roleId ===
                                                requirement.roleId &&
                                              isActiveAssignment({
                                                status: assignment.status,
                                              }),
                                          );
                                        const roleLabel =
                                          data.roles.find(
                                            (role) =>
                                              role.id === requirement.roleId,
                                          )?.name ?? 'Role';
                                        const requirementFocusKey = focusKey({
                                          shiftId: shift.shiftId,
                                          roleId: requirement.roleId,
                                        });
                                        const cellDerived =
                                          cellDerivedByKey.get(
                                            requirementFocusKey,
                                          );
                                        const suggestionGroups =
                                          cellDerived?.recommendations ?? {
                                            safe: [],
                                            needsResponse: [],
                                            conflicts: [],
                                          };
                                        const focusOnRequirement = () =>
                                          onFocusRequirement({
                                            key: requirementFocusKey,
                                            label: buildFocusLabel({
                                              roleLabel,
                                              slotLabel:
                                                slot.label ?? 'this shift',
                                              eventTitle: event.title,
                                              dateText: dateLabel(date),
                                            }),
                                            shiftId: shift.shiftId,
                                            roleId: requirement.roleId,
                                            roleLabel,
                                            slotLabel:
                                              slot.label ?? 'this shift',
                                            ...rankVolunteersForShiftRole({
                                              shift,
                                              roleId: requirement.roleId,
                                              assignments: data.assignments,
                                            }),
                                          });
                                        return (
                                          <CycleBuilderCell
                                            key={requirement.roleId}
                                            shift={shift}
                                            roleId={requirement.roleId}
                                            roleLabel={roleLabel}
                                            requiredCount={
                                              requirement.requiredCount
                                            }
                                            assignments={assignments}
                                            pickerVolunteers={
                                              cellDerived?.candidates ?? []
                                            }
                                            suggestions={suggestionGroups.safe}
                                            needsResponseSuggestions={
                                              suggestionGroups.needsResponse
                                            }
                                            conflictSuggestions={
                                              suggestionGroups.conflicts
                                            }
                                            slotLabel={
                                              slot.label ?? 'this shift'
                                            }
                                            selectedVolunteerId={
                                              selectedVolunteerId
                                            }
                                            selectedVolunteerName={
                                              selectedVolunteerName
                                            }
                                            isPublished={
                                              event.state === 'published'
                                            }
                                            isFocused={
                                              focusedKey === requirementFocusKey
                                            }
                                            onFocus={focusOnRequirement}
                                            onToggleFocus={() => {
                                              if (
                                                focusedKey ===
                                                requirementFocusKey
                                              )
                                                onClearFocus();
                                              else focusOnRequirement();
                                            }}
                                            onSelect={onSelectAssignment}
                                            onRemove={onRemoveAssignment}
                                            failedWrites={failedWritesByCell.get(
                                              requirementFocusKey,
                                            )}
                                            onRetryFailedWrite={
                                              onRetryFailedWrite
                                            }
                                            onDismissFailedWrite={
                                              onDismissFailedWrite
                                            }
                                            contextTeamId={requirement.teamId}
                                          />
                                        );
                                      })}
                                    </div>
                                  </section>
                                ))}
                              </div>
                            </section>
                          ))}
                      </section>
                    ))}
                    {(eventsForDate.get(date) ?? []).length === 0 ? (
                      <p className="px-1 py-4 text-muted-foreground text-xs">
                        No events
                      </p>
                    ) : null}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
