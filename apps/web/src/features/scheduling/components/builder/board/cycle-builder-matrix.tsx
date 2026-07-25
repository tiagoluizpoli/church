import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  useBoardDragScroll,
  useDateStripDragScroll,
} from '../../../hooks/use-cycle-board-drag-scroll';
import {
  type CycleBuilderData,
  isActiveAssignment,
} from '../../../hooks/use-cycle-builder';
import {
  assignableFits,
  buildCellDerivedIndex,
  buildShiftAssignmentIndex,
} from '../../../utils/builder/cycle-builder-assignment-index.utils';
import {
  type DateMode,
  type DateSpanMode,
  dateLabel,
  deriveEventDates,
  enumerateDates,
  eventMatchesDateSpan,
  eventOccursOnDay,
  isDateWithinRange,
  weekdayForDayKey,
} from '../../../utils/builder/cycle-builder-date.utils';
import {
  draggedVolunteerId,
  dropTargetData,
} from '../../../utils/builder/cycle-builder-dnd.utils';
import {
  overrideKindForFit,
  volunteerFitForShiftRole,
} from '../../../utils/builder/cycle-builder-fit.utils';
import { pool } from '../../../utils/builder/cycle-builder-pool.utils';
import {
  countWorkload,
  rankVolunteersForShiftRole,
} from '../../../utils/builder/cycle-builder-ranking.utils';
import {
  buildFocusLabel,
  type FocusedShift,
  findShiftById,
  findShiftContextById,
  focusKey,
  roleHasRoom,
} from '../../../utils/builder/cycle-builder-shift-lookup.utils';
import { VolunteerCard } from '../volunteer-rail/volunteer-card';
import { VolunteerPoolSidebar } from '../volunteer-rail/volunteer-pool-sidebar';
import { CycleBuilderBoardGrid } from './cycle-builder-board-grid';
import type { CycleBuilderCellSelectInput } from './cycle-builder-cell';
import type { FailedAssignmentWrite } from './cycle-builder-cell-parts';
import { CycleBuilderDateFilters } from './cycle-builder-date-filters';
import { CycleBuilderDateStrip } from './cycle-builder-date-strip';
import { FormControlSizeProvider } from '@/components/ui/form-control-size';
import { useMediaQuery } from '@/hooks/use-media-query';
import { toCycleDayKey } from '@/shared/utils/date';

interface Props {
  data: CycleBuilderData;
  cycleStartDate?: string;
  cycleEndDate?: string;
  selectedDate: string | null;
  onSelectedDateChange: (date: string | null) => void;
  selectedVolunteerId?: string;
  onSelectVolunteer: (id: string | undefined) => void;
  onSelectAssignment: (input: CycleBuilderCellSelectInput) => void;
  onRemoveAssignment: (id: string) => void;
  /** Writes the server rejected, still shown in the cell they were made in. */
  failedWrites?: FailedAssignmentWrite[];
  onRetryFailedWrite?: (failedWriteId: string) => void;
  onDismissFailedWrite?: (failedWriteId: string) => void;
  /** Audit/publish controls, rendered on the filter toolbar's own row. */
  actions?: ReactNode;
}

export function CycleBuilderMatrix(props: Props) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const boardDragScroll = useBoardDragScroll();
  const dateStripDragScroll = useDateStripDragScroll();
  const [dateMode, setDateMode] = useState<DateMode>('event_dates');
  const [dateSpanMode, setDateSpanMode] = useState<DateSpanMode>('starts');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [eventQuery, setEventQuery] = useState('');
  const [weekday, setWeekday] = useState<number | null>(null);
  const [dateFiltersOpen, setDateFiltersOpen] = useState(false);
  const [focused, setFocused] = useState<FocusedShift | null>(null);
  // The volunteer under an in-flight drag. It drives a DragOverlay portal so the
  // dragged card floats above the whole board instead of translating in place
  // inside the rail's ScrollArea, which clipped it "behind the pane".
  const [draggingVolunteerId, setDraggingVolunteerId] = useState<string | null>(
    null,
  );
  const eventDates = useMemo(
    () => deriveEventDates({ events: props.data.events }),
    [props.data.events],
  );
  // Built once per query payload and read by every cell's picker; see
  // `buildShiftAssignmentIndex` for why this used to run per role per column.
  const shiftAssignmentIndex = useMemo(
    () => buildShiftAssignmentIndex({ data: props.data }),
    [props.data],
  );
  // `candidates()`/`recommendations()` are pure functions of a shift×role plus
  // this index, so — like the index itself — they only need recomputing when
  // the query payload changes, not on every render (a rail selection, a date
  // filter, or opening the filter Collapsible used to re-run them for every
  // visible cell for no reason).
  const cellDerivedByKey = useMemo(
    () =>
      buildCellDerivedIndex({ data: props.data, index: shiftAssignmentIndex }),
    [props.data, shiftAssignmentIndex],
  );
  const cycleStartDate = props.cycleStartDate
    ? toCycleDayKey(props.cycleStartDate)
    : (eventDates[0] ?? '');
  const cycleEndDate = props.cycleEndDate
    ? toCycleDayKey(props.cycleEndDate)
    : (eventDates.at(-1) ?? '');
  const allCycleDates = useMemo(
    () =>
      cycleStartDate && cycleEndDate
        ? enumerateDates({ startDate: cycleStartDate, endDate: cycleEndDate })
        : [],
    [cycleEndDate, cycleStartDate],
  );
  useEffect(() => {
    setRangeStart(cycleStartDate);
    setRangeEnd(cycleEndDate);
  }, [cycleEndDate, cycleStartDate]);
  const eventsForDate = useMemo(() => {
    const query = eventQuery.trim().toLocaleLowerCase();
    // Keyed over the cycle's own days *and* every day an event actually serves:
    // an event sitting outside the cycle bounds still has to resolve to a
    // column rather than silently dropping out of `dates` below.
    const keys = [...new Set([...allCycleDates, ...eventDates])].sort();
    return new Map(
      keys.map((date) => [
        date,
        props.data.events.filter(
          (event) =>
            eventOccursOnDay({ event, day: date }) &&
            (!query || event.title.toLocaleLowerCase().includes(query)) &&
            (dateMode !== 'event_dates' ||
              eventMatchesDateSpan({
                event,
                mode: dateSpanMode,
                rangeStart,
                rangeEnd,
              })),
        ),
      ]),
    );
  }, [
    allCycleDates,
    dateMode,
    dateSpanMode,
    eventDates,
    eventQuery,
    props.data.events,
    rangeEnd,
    rangeStart,
  ]);
  const weekdayFilters = useMemo(() => {
    const counts = new Map<number, number>();
    for (const date of eventDates) {
      const day = weekdayForDayKey({ day: date });
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return [...counts].filter(([, count]) => count > 1).map(([day]) => day);
  }, [eventDates]);
  const dates = useMemo(() => {
    const matchesWeekday = (date: string) =>
      weekday === null || weekdayForDayKey({ day: date }) === weekday;
    if (dateMode === 'all_cycle_dates') {
      return allCycleDates.filter(
        (date) =>
          isDateWithinRange({ date, rangeStart, rangeEnd }) &&
          matchesWeekday(date),
      );
    }
    // Event-span filtering (dateSpanMode) already happened inside
    // `eventsForDate` — a date column earns its place here purely by still
    // having events left after that filter, not by its own raw position
    // relative to rangeStart/rangeEnd (a multi-day event can legitimately
    // "end within range" while its earlier days sit outside it).
    return eventDates.filter(
      (date) =>
        matchesWeekday(date) && (eventsForDate.get(date)?.length ?? 0) > 0,
    );
  }, [
    allCycleDates,
    dateMode,
    eventDates,
    eventsForDate,
    rangeEnd,
    rangeStart,
    weekday,
  ]);
  const columns = props.selectedDate ? [props.selectedDate] : dates;
  const filtersAreDefault =
    dateMode === 'event_dates' &&
    dateSpanMode === 'starts' &&
    rangeStart === cycleStartDate &&
    rangeEnd === cycleEndDate &&
    eventQuery === '' &&
    weekday === null;
  // A filter folded out of sight still has to announce itself, or the board
  // silently hides dates with nothing on screen saying why (B-4).
  const activeDateFilterCount =
    (dateSpanMode === 'starts' ? 0 : 1) +
    (rangeStart === cycleStartDate ? 0 : 1) +
    (rangeEnd === cycleEndDate ? 0 : 1) +
    (weekday === null ? 0 : 1);
  const clearFilters = () => {
    setDateMode('event_dates');
    setDateSpanMode('starts');
    setRangeStart(cycleStartDate);
    setRangeEnd(cycleEndDate);
    setEventQuery('');
    setWeekday(null);
  };
  // A failed write belongs to the cell the leader made it in, so it is indexed
  // by shift×role once rather than rescanned per cell per render.
  const failedWritesByCell = useMemo(() => {
    const byCell = new Map<string, FailedAssignmentWrite[]>();
    for (const failedWrite of props.failedWrites ?? []) {
      const key = focusKey({
        shiftId: failedWrite.shiftId,
        roleId: failedWrite.roleId,
      });
      const existing = byCell.get(key);
      if (existing) existing.push(failedWrite);
      else byCell.set(key, [failedWrite]);
    }
    return byCell;
  }, [props.failedWrites]);
  const volunteers = useMemo(() => pool(props.data), [props.data]);
  const activeAssignments = props.data.assignments.filter((assignment) =>
    isActiveAssignment({ status: assignment.status }),
  );
  const selectedName = volunteers.find(
    (volunteer) => volunteer.volunteerId === props.selectedVolunteerId,
  )?.volunteerName;
  // The full card model for the drag ghost — the pool row plus its live cycle
  // workload, so the floating overlay reads identically to its source card.
  const draggingVolunteer = useMemo(() => {
    if (!draggingVolunteerId) return null;
    const poolVolunteer = volunteers.find(
      (volunteer) => volunteer.volunteerId === draggingVolunteerId,
    );
    if (!poolVolunteer) return null;
    const workload = countWorkload({ assignments: activeAssignments });
    return {
      ...poolVolunteer,
      workloadCount: workload.get(poolVolunteer.volunteerId) ?? 0,
    };
  }, [draggingVolunteerId, volunteers, activeAssignments]);
  // Assign a rail person straight to the focused shift×role, through the very
  // same path the board's own assign uses — so conflict overrides and
  // already-assigned-elsewhere collisions are captured identically no matter
  // which surface started the assignment. Clearing focus afterwards returns the
  // cards to their plain "Select slot" state.
  const focusedShift =
    focused && findShiftById({ data: props.data, shiftId: focused.shiftId });
  // A full role can still be focused, so the rail honours the same headcount
  // ceiling the board enforces cell-side as `canAdd`.
  const focusedRoleHasRoom = Boolean(
    focused &&
      focusedShift &&
      roleHasRoom({ shift: focusedShift, roleId: focused.roleId }),
  );
  // Everyone the leader may commit to the focused slot, each carrying the tier
  // that pick would land in — so the rail's own button can say what the pick
  // costs instead of presenting a conflict commit as frictionless (B-2).
  // Qualification, like availability and double-booking, is an override path,
  // not a hard filter — `assignableFits()` below includes `unqualified`. Two
  // hard "no"s stay out: someone already serving this shift and anyone whose
  // fit is `none`.
  const focusedShiftAssigneeIds = focusedShift
    ? new Set(
        focusedShift.assignments
          .filter((assignment) =>
            isActiveAssignment({ status: assignment.status }),
          )
          .map((assignment) => assignment.volunteerId),
      )
    : null;
  const assignableFocusedVolunteerFits =
    focused && focusedShift && focusedRoleHasRoom
      ? assignableFits({
          shift: focusedShift,
          roleId: focused.roleId,
          excludedVolunteerIds: focusedShiftAssigneeIds,
        })
      : undefined;
  const assignFocusedVolunteer = (volunteerId: string) => {
    if (!focused || !focusedShift || !focusedRoleHasRoom) return;
    if (focusedShiftAssigneeIds?.has(volunteerId)) return;
    const fit = volunteerFitForShiftRole({
      shift: focusedShift,
      roleId: focused.roleId,
      volunteerId,
    });
    if (fit.tier === 'none') return;
    props.onSelectAssignment({
      volunteerId,
      shiftId: focused.shiftId,
      roleId: focused.roleId,
      volunteerName: volunteers.find(
        (volunteer) => volunteer.volunteerId === volunteerId,
      )?.volunteerName,
      slotLabel: focused.slotLabel,
      roleLabel: focused.roleLabel,
      // Whatever this pick has to justify — unavailable, double-booked, or
      // not qualified — comes from the shared predicate, never from this call
      // site's own reading of the tier (FR-016).
      conflictType: overrideKindForFit({ fit }),
    });
    setFocused(null);
  };
  return (
    <FormControlSizeProvider size={isMobile ? 'touch' : 'default'}>
      <div className="surface-panel space-y-4 p-4">
        <CycleBuilderDateFilters
          open={dateFiltersOpen}
          onOpenChange={setDateFiltersOpen}
          eventQuery={eventQuery}
          onEventQueryChange={setEventQuery}
          dateMode={dateMode}
          onDateModeChange={setDateMode}
          dateSpanMode={dateSpanMode}
          onDateSpanModeChange={setDateSpanMode}
          rangeStart={rangeStart}
          onRangeStartChange={setRangeStart}
          rangeEnd={rangeEnd}
          onRangeEndChange={setRangeEnd}
          cycleStartDate={cycleStartDate}
          cycleEndDate={cycleEndDate}
          weekdayFilters={weekdayFilters}
          weekday={weekday}
          onWeekdayChange={setWeekday}
          activeDateFilterCount={activeDateFilterCount}
          filtersAreDefault={filtersAreDefault}
          onClearFilters={clearFilters}
          visibleDateCount={columns.length}
          totalDateCount={dates.length}
          actions={props.actions}
        />
        <CycleBuilderDateStrip
          selectedDate={props.selectedDate}
          onSelectedDateChange={props.onSelectedDateChange}
          dates={dates}
          eventsForDate={eventsForDate}
          dragScroll={dateStripDragScroll}
        />
        <DndContext
          sensors={sensors}
          onDragStart={(event) =>
            setDraggingVolunteerId(
              draggedVolunteerId({ active: event.active }) ?? null,
            )
          }
          onDragCancel={() => setDraggingVolunteerId(null)}
          onDragEnd={(event) => {
            setDraggingVolunteerId(null);
            const volunteerId = draggedVolunteerId({ active: event.active });
            const target = dropTargetData({ over: event.over ?? null });
            if (volunteerId && target?.shiftId && target.roleId) {
              const shiftContext = findShiftContextById({
                data: props.data,
                shiftId: target.shiftId,
              });
              const shift = shiftContext?.shift;
              const roleLabel = props.data.roles.find(
                (role) => role.id === target.roleId,
              )?.name;
              if (shiftContext && shift && roleLabel) {
                const slotLabel = shiftContext.slot.label ?? 'this shift';
                setFocused({
                  key: focusKey({
                    shiftId: target.shiftId,
                    roleId: target.roleId,
                  }),
                  label: buildFocusLabel({
                    roleLabel,
                    slotLabel,
                    eventTitle: shiftContext.event.title,
                    dateText: dateLabel(shiftContext.event.startDate),
                  }),
                  shiftId: target.shiftId,
                  roleId: target.roleId,
                  roleLabel,
                  slotLabel,
                  ...rankVolunteersForShiftRole({
                    shift,
                    roleId: target.roleId,
                    assignments: props.data.assignments,
                  }),
                });
              }
              // Dropping onto a slot that needs an override is an override like
              // any other, and FR-016 does not care which gesture started it —
              // the reason dialog is gated on this field. The drop target is
              // disabled for tier `none`, so a drop that lands here is one the
              // predicate already accepted.
              const droppedFit = shift
                ? volunteerFitForShiftRole({
                    shift,
                    roleId: target.roleId,
                    volunteerId,
                  })
                : undefined;
              props.onSelectAssignment({
                volunteerId,
                shiftId: target.shiftId,
                roleId: target.roleId,
                roleLabel,
                assignmentId: target.assignmentId,
                conflictType: droppedFit
                  ? overrideKindForFit({ fit: droppedFit })
                  : undefined,
              });
            }
          }}
        >
          {/* 23.75rem = 380px. Widened from 320px so the AE card's three
              columns each keep their own band instead of the roles line and
              the recency block fighting for the same width. */}
          <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1fr)_23.75rem]">
            <CycleBuilderBoardGrid
              data={props.data}
              columns={columns}
              eventsForDate={eventsForDate}
              cellDerivedByKey={cellDerivedByKey}
              failedWritesByCell={failedWritesByCell}
              selectedVolunteerId={props.selectedVolunteerId}
              selectedVolunteerName={selectedName}
              focusedKey={focused?.key}
              onFocusRequirement={setFocused}
              onClearFocus={() => setFocused(null)}
              onSelectAssignment={props.onSelectAssignment}
              onRemoveAssignment={props.onRemoveAssignment}
              onRetryFailedWrite={props.onRetryFailedWrite}
              onDismissFailedWrite={props.onDismissFailedWrite}
              filtersAreDefault={filtersAreDefault}
              onClearFilters={clearFilters}
              dragScroll={boardDragScroll}
            />
            <VolunteerPoolSidebar
              volunteers={volunteers}
              assignments={activeAssignments}
              roles={props.data.roles}
              selectedVolunteerId={props.selectedVolunteerId}
              onSelectVolunteer={props.onSelectVolunteer}
              focusedVolunteerIds={focused?.ids}
              focusLabel={focused?.label}
              idealVolunteerId={focused?.idealVolunteerId}
              assignableVolunteerFits={assignableFocusedVolunteerFits}
              onAssignFocusedVolunteer={
                focused && focusedRoleHasRoom
                  ? assignFocusedVolunteer
                  : undefined
              }
              onClearFocus={focused ? () => setFocused(null) : undefined}
            />
          </div>
          {/* The drag ghost lives in a portal above the whole layout, so it
              floats over the board instead of being clipped by the rail's
              scroll container. */}
          <DragOverlay>
            {draggingVolunteer ? (
              <VolunteerCard volunteer={draggingVolunteer} isOverlay />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </FormControlSizeProvider>
  );
}
