import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CalendarDays, FilterIcon, LocateFixed, XIcon } from 'lucide-react';
import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CycleBuilderData,
  CycleBuilderShiftSummary,
} from '../../hooks/use-cycle-builder';
import type { PoolVolunteer } from '../../hooks/use-volunteer-pool';
import type {
  PickerVolunteer,
  ServingAssignmentContext,
} from './assignment-picker';
import {
  CycleBuilderCell,
  type CycleBuilderCellSelectInput,
} from './cycle-builder-cell';
import {
  type DateSpanMode,
  deriveEventDates,
  enumerateDates,
  eventMatchesDateSpan,
  eventOccursOnDay,
  eventSlotsOnDay,
  isDateWithinRange,
  weekdayForDayKey,
} from './cycle-builder-matrix.utils';
import type { SuggestedVolunteer } from './suggestion-list';
import { VolunteerPoolSidebar } from './volunteer-pool-sidebar';
import { DatePickerField } from '@/components/date-picker-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FormControlSizeProvider } from '@/components/ui/form-control-size';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { toCycleDayKey, toLocalDayKey } from '@/shared/utils/date';

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
}

const dateLabel = (date: string) =>
  new Date(`${toLocalDayKey(date)}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
const timeLabel = (date: string) =>
  new Date(date).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

/** Same green/amber/destructive semantic palette used for volunteer
 * availability elsewhere in the builder (assignment-picker.tsx,
 * suggestion-list.tsx) — reused here so a date's staffing status reads at a
 * glance instead of requiring the leader to read every percentage. A date
 * with no requirements yet (no events, or events with none included) stays
 * neutral rather than flashing red — there's nothing to be missing. */
function staffingStatusClasses(
  percent: number,
  hasRequirement: boolean,
): { text: string; bar: string } {
  if (!hasRequirement) {
    return { text: 'text-muted-foreground', bar: 'bg-muted-foreground/30' };
  }
  if (percent >= 100) {
    return { text: 'text-green-700 dark:text-green-400', bar: 'bg-green-600' };
  }
  if (percent >= 50) {
    return {
      text: 'text-yellow-700 dark:text-yellow-300',
      bar: 'bg-yellow-500',
    };
  }
  return { text: 'text-destructive', bar: 'bg-destructive' };
}

const BOARD_DRAG_THRESHOLD_PX = 4;
// The date strip's cards sit edge-to-edge with almost no gap between them
// (unlike the board's spacious cells), so drag has to be armable by
// pressing directly on a card, not just in the sliver between them. A
// slightly higher threshold than the board's absorbs ordinary click jitter
// without needing to exclude buttons from arming the drag at all.
const DATE_DRAG_THRESHOLD_PX = 10;

interface BoardDragState {
  pointerId: number;
  startClientX: number;
  startScrollLeft: number;
  hasDragged: boolean;
  captureElement: HTMLDivElement;
}

type DateMode = 'event_dates' | 'all_cycle_dates';

function pool(data: CycleBuilderData): PoolVolunteer[] {
  const result = new Map<string, PoolVolunteer>();
  const roleNameById = new Map(data.roles.map((role) => [role.id, role.name]));
  for (const event of data.events)
    for (const slot of event.slots)
      for (const shift of slot.shifts)
        for (const volunteer of shift.eligibleVolunteers) {
          result.set(volunteer.volunteerId, {
            volunteerId: volunteer.volunteerId,
            volunteerName: volunteer.volunteerName,
            status: volunteer.hasConflict
              ? 'unavailable'
              : volunteer.isAvailable
                ? 'available'
                : 'no_response',
            // Ids with no matching role are dropped rather than shown raw: a
            // uuid on the card would read as a skill name.
            qualifiedRoleNames: volunteer.qualifiedRoleIds
              .map((roleId) => roleNameById.get(roleId))
              .filter((name): name is string => name != null)
              .sort((left, right) => left.localeCompare(right)),
          });
        }
  for (const assignment of data.assignments)
    if (!result.has(assignment.volunteerId))
      result.set(assignment.volunteerId, {
        volunteerId: assignment.volunteerId,
        volunteerName: assignment.volunteerName ?? assignment.volunteerId,
        status: 'no_response',
      });
  return [...result.values()];
}

function candidates(
  shift: CycleBuilderShiftSummary,
  data: CycleBuilderData,
): PickerVolunteer[] {
  const assignmentContext = getShiftAssignmentContext({ shift, data });
  const workload = new Map<string, number>();
  for (const assignment of data.assignments)
    if (assignment.status !== 'cancelled' && assignment.status !== 'declined')
      workload.set(
        assignment.volunteerId,
        (workload.get(assignment.volunteerId) ?? 0) + 1,
      );
  return shift.eligibleVolunteers
    .filter(
      (volunteer) =>
        !assignmentContext.assignedVolunteerIds.has(volunteer.volunteerId),
    )
    .map((volunteer) => ({
      id: volunteer.volunteerId,
      name: volunteer.volunteerName,
      availabilityStatus: volunteer.hasConflict
        ? 'unavailable'
        : volunteer.isAvailable
          ? 'available'
          : 'no_response',
      alreadyAssignedCount: workload.get(volunteer.volunteerId) ?? 0,
      alreadyServingAssignments:
        assignmentContext.otherAssignmentsByVolunteerId.get(
          volunteer.volunteerId,
        ),
    }));
}

function recommendations(
  shift: CycleBuilderShiftSummary,
  data: CycleBuilderData,
) {
  const assignmentContext = getShiftAssignmentContext({ shift, data });
  const workload = new Map<string, number>();
  for (const assignment of data.assignments)
    if (assignment.status !== 'cancelled' && assignment.status !== 'declined')
      workload.set(
        assignment.volunteerId,
        (workload.get(assignment.volunteerId) ?? 0) + 1,
      );
  const toSuggestion = (
    volunteer: (typeof shift.eligibleVolunteers)[number],
    status: SuggestedVolunteer['status'],
  ): SuggestedVolunteer => ({
    id: volunteer.volunteerId,
    name: volunteer.volunteerName,
    status,
    workloadCount: workload.get(volunteer.volunteerId) ?? 0,
    conflictType: volunteer.hasConflict ? 'double_booked' : 'unavailable',
  });
  const eligible = shift.eligibleVolunteers.filter(
    (volunteer) =>
      !assignmentContext.assignedVolunteerIds.has(volunteer.volunteerId) &&
      !assignmentContext.otherAssignmentsByVolunteerId.has(
        volunteer.volunteerId,
      ),
  );
  return {
    safe: eligible
      .filter((volunteer) => volunteer.isAvailable && !volunteer.hasConflict)
      .sort((left, right) => {
        const served =
          (left.lastServedAt ? new Date(left.lastServedAt).getTime() : 0) -
          (right.lastServedAt ? new Date(right.lastServedAt).getTime() : 0);
        return (
          served ||
          (workload.get(left.volunteerId) ?? 0) -
            (workload.get(right.volunteerId) ?? 0) ||
          left.volunteerName.localeCompare(right.volunteerName)
        );
      })
      .slice(0, 5)
      .map((volunteer) => toSuggestion(volunteer, 'available')),
    needsResponse: eligible
      .filter((volunteer) => !volunteer.isAvailable && !volunteer.hasConflict)
      .slice(0, 5)
      .map((volunteer) => toSuggestion(volunteer, 'needs_response')),
    conflicts: eligible
      .filter((volunteer) => volunteer.hasConflict)
      .slice(0, 5)
      .map((volunteer) => toSuggestion(volunteer, 'conflict')),
  };
}

interface ShiftAssignmentContext {
  assignedVolunteerIds: Set<string>;
  otherAssignmentsByVolunteerId: Map<string, ServingAssignmentContext[]>;
}

function getShiftAssignmentContext({
  shift,
  data,
}: {
  shift: CycleBuilderShiftSummary;
  data: CycleBuilderData;
}): ShiftAssignmentContext {
  const shiftContextById = new Map<string, ServingAssignmentContext>();
  const roleNameById = new Map(data.roles.map((role) => [role.id, role.name]));
  for (const event of data.events) {
    for (const slot of event.slots) {
      for (const candidateShift of slot.shifts) {
        const timeRange = `${timeLabel(candidateShift.startTime)}–${timeLabel(candidateShift.endTime)}`;
        const shiftLabel =
          candidateShift.label != null
            ? `${candidateShift.label} · ${timeRange}`
            : timeRange;
        shiftContextById.set(candidateShift.shiftId, {
          summary: `${dateLabel(event.startDate)} · ${shiftLabel}`,
          detail: `${event.title} · ${dateLabel(event.startDate)} · ${shiftLabel}`,
        });
      }
    }
  }

  const assignedVolunteerIds = new Set<string>();
  const otherAssignmentsByVolunteerId = new Map<
    string,
    ServingAssignmentContext[]
  >();
  for (const assignment of data.assignments) {
    if (assignment.status === 'cancelled' || assignment.status === 'declined') {
      continue;
    }
    if (!assignment.shiftId) {
      continue;
    }

    if (assignment.shiftId === shift.shiftId) {
      assignedVolunteerIds.add(assignment.volunteerId);
      continue;
    }

    const shiftContext = shiftContextById.get(assignment.shiftId);
    if (!shiftContext) {
      continue;
    }
    const roleLabel = roleNameById.get(assignment.roleId) ?? 'Role';
    const context = {
      summary: `${shiftContext.summary} · ${roleLabel}`,
      detail: `${shiftContext.detail} · ${roleLabel}`,
    };
    const existing = otherAssignmentsByVolunteerId.get(assignment.volunteerId);
    otherAssignmentsByVolunteerId.set(assignment.volunteerId, [
      ...(existing ?? []),
      context,
    ]);
  }

  return { assignedVolunteerIds, otherAssignmentsByVolunteerId };
}

export function CycleBuilderMatrix(props: Props) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const boardViewportRef = useRef<HTMLDivElement>(null);
  const boardDragState = useRef<BoardDragState | null>(null);
  const suppressNextBoardClick = useRef(false);
  const dateViewportRef = useRef<HTMLDivElement>(null);
  const dateDragState = useRef<BoardDragState | null>(null);
  const [dateMode, setDateMode] = useState<DateMode>('event_dates');
  const [dateSpanMode, setDateSpanMode] = useState<DateSpanMode>('starts');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [eventQuery, setEventQuery] = useState('');
  const [weekday, setWeekday] = useState<number | null>(null);
  const [focused, setFocused] = useState<{
    label: string;
    ids: Set<string>;
  } | null>(null);
  const eventDates = useMemo(
    () => deriveEventDates({ events: props.data.events }),
    [props.data.events],
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
  const clearFilters = () => {
    setDateMode('event_dates');
    setDateSpanMode('starts');
    setRangeStart(cycleStartDate);
    setRangeEnd(cycleEndDate);
    setEventQuery('');
    setWeekday(null);
  };
  const volunteers = useMemo(() => pool(props.data), [props.data]);
  const activeAssignments = props.data.assignments.filter(
    (assignment) =>
      assignment.status !== 'cancelled' && assignment.status !== 'declined',
  );
  const selectedName = volunteers.find(
    (volunteer) => volunteer.volunteerId === props.selectedVolunteerId,
  )?.volunteerName;
  const gridStyle = {
    gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(320px, 1fr))`,
  };
  const clearBoardDrag = (pointerId: number) => {
    const captureElement = boardDragState.current?.captureElement;
    boardDragState.current = null;
    captureElement?.classList.remove('select-none');
    if (captureElement?.hasPointerCapture?.(pointerId))
      captureElement.releasePointerCapture(pointerId);
  };
  const onBoardPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (
      (event.target as HTMLElement).closest(
        'button, input, select, textarea, a, [role="button"], [data-slot="scroll-area-scrollbar"]',
      )
    )
      return;
    const viewport = boardViewportRef.current;
    if (!viewport) return;
    boardDragState.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startScrollLeft: viewport.scrollLeft,
      hasDragged: false,
      captureElement: event.currentTarget,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onBoardPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = boardViewportRef.current;
    const drag = boardDragState.current;
    if (!viewport || !drag || drag.pointerId !== event.pointerId) return;
    if (event.buttons === 0) {
      clearBoardDrag(event.pointerId);
      return;
    }
    const distance = event.clientX - drag.startClientX;
    if (Math.abs(distance) > BOARD_DRAG_THRESHOLD_PX) {
      if (!drag.hasDragged) {
        drag.hasDragged = true;
        event.currentTarget.classList.add('select-none');
      }
      event.preventDefault();
      viewport.scrollLeft = drag.startScrollLeft - distance;
    }
  };
  const onDatePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = dateViewportRef.current;
    if (!viewport || event.button !== 0) return;
    // Only the small per-card focus button is an interactive element here
    // now — everything else on a card is plain drag surface with no click
    // handler of its own, so excluding buttons from arming the drag no
    // longer costs almost all the grabbable area the way it did when the
    // whole card was one giant button.
    if ((event.target as HTMLElement).closest('button, [role="button"]'))
      return;
    dateDragState.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startScrollLeft: viewport.scrollLeft,
      hasDragged: false,
      captureElement: event.currentTarget,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onDatePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = dateViewportRef.current;
    const drag = dateDragState.current;
    if (!viewport || !drag || drag.pointerId !== event.pointerId) return;
    const distance = event.clientX - drag.startClientX;
    if (Math.abs(distance) > DATE_DRAG_THRESHOLD_PX) {
      drag.hasDragged = true;
      event.preventDefault();
      viewport.scrollLeft = drag.startScrollLeft - distance;
    }
  };
  const endDateDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dateDragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dateDragState.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const endBoardDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = boardDragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressNextBoardClick.current = drag.hasDragged;
    clearBoardDrag(event.pointerId);
  };
  return (
    <FormControlSizeProvider size={isMobile ? 'touch' : 'default'}>
      <div className="surface-panel space-y-4 p-4">
        <section className="flex flex-wrap items-end gap-x-4 gap-y-3 border-b pb-3">
          <div className="space-y-1">
            <Label htmlFor="cycle-builder-event-search">
              <FilterIcon className="size-3.5 text-muted-foreground" />
              Search events
            </Label>
            <Input
              id="cycle-builder-event-search"
              value={eventQuery}
              onChange={(event) => setEventQuery(event.target.value)}
              placeholder="Search events…"
              aria-label="Search events"
              className="w-40"
            />
          </div>
          <div className="flex items-end gap-2 border-l pl-4">
            <div className="space-y-1">
              <Label htmlFor="cycle-builder-date-span-mode">Date range</Label>
              <div className={isMobile ? 'h-11' : 'h-8'}>
                <Select
                  value={dateSpanMode}
                  onValueChange={(value) =>
                    setDateSpanMode(value as DateSpanMode)
                  }
                >
                  <SelectTrigger
                    id="cycle-builder-date-span-mode"
                    data-testid="cycle-builder-date-span-mode"
                    className={cn(
                      'w-32',
                      isMobile && 'px-3 text-sm data-[size=default]:h-11',
                    )}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starts">Starts</SelectItem>
                    <SelectItem value="ends">Ends</SelectItem>
                    <SelectItem value="within">Within</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cycle-builder-date-start-filter">From</Label>
              <DatePickerField
                id="cycle-builder-date-start-filter"
                value={rangeStart}
                onChange={setRangeStart}
                placeholder="From"
                minDate={cycleStartDate}
                maxDate={cycleEndDate}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cycle-builder-date-end-filter">To</Label>
              <DatePickerField
                id="cycle-builder-date-end-filter"
                value={rangeEnd}
                onChange={setRangeEnd}
                placeholder="To"
                minDate={cycleStartDate}
                maxDate={cycleEndDate}
              />
            </div>
          </div>
          <div className="space-y-1 border-l pl-4">
            <Label>Show</Label>
            <div className="flex gap-1">
              <Button
                type="button"
                variant={dateMode === 'event_dates' ? 'secondary' : 'ghost'}
                onClick={() => setDateMode('event_dates')}
              >
                Event dates
              </Button>
              <Button
                type="button"
                variant={dateMode === 'all_cycle_dates' ? 'secondary' : 'ghost'}
                onClick={() => setDateMode('all_cycle_dates')}
              >
                All cycle dates
              </Button>
            </div>
          </div>
          {weekdayFilters.length > 0 ? (
            <div className="space-y-1 border-l pl-4">
              <Label>Repeats on</Label>
              <div className="flex gap-1">
                {weekdayFilters.map((day) => (
                  <Button
                    key={day}
                    type="button"
                    variant={weekday === day ? 'secondary' : 'ghost'}
                    onClick={() => setWeekday(weekday === day ? null : day)}
                  >
                    {new Intl.DateTimeFormat(undefined, {
                      weekday: 'long',
                    }).format(new Date(2026, 7, 2 + day))}
                    s
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="ml-auto flex items-end gap-3">
            <Button
              type="button"
              variant="ghost"
              disabled={filtersAreDefault}
              onClick={clearFilters}
            >
              Clear filters
            </Button>
            <span className="pb-1.5 text-muted-foreground text-xs">
              {columns.length} of {dates.length} dates visible
            </span>
          </div>
        </section>
        <div className="flex items-stretch gap-2">
          {/* pb-3 matches the date strip's own scrollbar clearance so this
           * button stretches to the CARD height, not the card+scrollbar-gap
           * height — `items-stretch` above pins it to the row's tallest
           * child (the scroll area). */}
          <div className="shrink-0 pb-3">
            <button
              type="button"
              data-testid="cycle-date-strip-focus"
              aria-pressed={props.selectedDate !== null}
              aria-label={
                props.selectedDate
                  ? `Showing ${dateLabel(props.selectedDate)} only — clear to show all dates`
                  : 'Showing all dates'
              }
              disabled={props.selectedDate === null}
              onClick={() => props.onSelectedDateChange(null)}
              className="flex h-full min-w-32 flex-col items-center justify-center gap-1 rounded-lg border border-border border-dashed bg-card px-3 py-2 text-center text-muted-foreground text-sm disabled:opacity-100 aria-pressed:border-primary aria-pressed:border-solid aria-pressed:text-primary"
            >
              {props.selectedDate ? (
                <>
                  <XIcon className="size-4" />
                  <span className="font-semibold text-foreground">
                    {dateLabel(props.selectedDate)}
                  </span>
                  <span className="text-[11px] text-muted-foreground leading-tight">
                    Tap to show all dates
                  </span>
                </>
              ) : (
                <>
                  <CalendarDays className="size-4" />
                  <span className="font-semibold text-foreground">
                    All dates
                  </span>
                  <span className="text-[11px] text-muted-foreground leading-tight">
                    Tap a day to focus it
                  </span>
                </>
              )}
            </button>
          </div>
          <ScrollArea
            className="min-w-0 pb-3"
            data-testid="cycle-date-strip-scroll"
            viewportRef={dateViewportRef}
            viewportTestId="cycle-date-strip-viewport"
            scrollbarOrientation="horizontal"
          >
            <section
              className="flex min-h-10 touch-pan-y gap-2 pb-1"
              aria-label="Cycle dates"
              onPointerDown={onDatePointerDown}
              onPointerMove={onDatePointerMove}
              onPointerUp={endDateDrag}
              onPointerCancel={endDateDrag}
            >
              {dates.map((date) => {
                const dayEvents = eventsForDate.get(date) ?? [];
                const assigned = dayEvents.reduce(
                  (total, event) => total + event.assignedCount,
                  0,
                );
                const required = dayEvents.reduce(
                  (total, event) => total + event.requiredCount,
                  0,
                );
                const percent = required
                  ? Math.round((assigned / required) * 100)
                  : 0;
                const selected = props.selectedDate === date;
                const staffing = staffingStatusClasses(percent, required > 0);
                return (
                  <div
                    key={date}
                    data-selected={selected}
                    className="relative min-w-48 flex-1 rounded-lg border border-border bg-card p-3 text-left data-[selected=true]:border-primary data-[selected=true]:bg-primary/5"
                  >
                    <span className="flex items-center justify-between font-semibold text-sm">
                      <button
                        type="button"
                        aria-pressed={selected}
                        aria-label={
                          selected
                            ? 'Show all dates'
                            : `Show only ${dateLabel(date)}`
                        }
                        onClick={() =>
                          props.onSelectedDateChange(selected ? null : date)
                        }
                        className="-my-1 -ml-1 flex items-center gap-1.5 rounded-md p-1 text-foreground hover:bg-muted aria-pressed:text-primary"
                      >
                        {dateLabel(date)}
                        <LocateFixed className="size-3.5 text-muted-foreground" />
                      </button>
                      <span
                        className={cn('text-xs', staffing.text)}
                        data-testid="cycle-date-staffing-percent"
                      >
                        {percent}%
                      </span>
                    </span>
                    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
                      <span
                        className={cn('block h-full', staffing.bar)}
                        style={{ width: `${percent}%` }}
                      />
                    </span>
                    <span className="mt-2 block text-muted-foreground text-xs">
                      {dayEvents.length} event
                      {dayEvents.length === 1 ? '' : 's'} · staffing progress
                    </span>
                  </div>
                );
              })}
            </section>
          </ScrollArea>
        </div>
        <DndContext
          sensors={sensors}
          onDragEnd={(event) => {
            const volunteerId = event.active.data.current?.volunteerId as
              | string
              | undefined;
            const target = event.over?.data.current as
              | { shiftId?: string; roleId?: string; assignmentId?: string }
              | undefined;
            if (volunteerId && target?.shiftId && target.roleId) {
              const shift = props.data.events
                .flatMap((builderEvent) => builderEvent.slots)
                .flatMap((slot) => slot.shifts)
                .find((candidate) => candidate.shiftId === target.shiftId);
              const roleLabel = props.data.roles.find(
                (role) => role.id === target.roleId,
              )?.name;
              if (shift && roleLabel)
                setFocused({
                  label: `${roleLabel} · ${shift.label ?? 'Shift'}`,
                  ids: new Set(
                    shift.eligibleVolunteers.map(
                      (candidate) => candidate.volunteerId,
                    ),
                  ),
                });
              props.onSelectAssignment({
                volunteerId,
                shiftId: target.shiftId,
                roleId: target.roleId,
                assignmentId: target.assignmentId,
              });
            }
          }}
        >
          <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <Card
              className={cn(
                'min-w-0 touch-pan-y border-0 bg-transparent py-0 shadow-none',
              )}
              data-testid="cycle-board-drag-surface"
              onPointerDown={onBoardPointerDown}
              onPointerMove={onBoardPointerMove}
              onPointerUp={endBoardDrag}
              onPointerCancel={endBoardDrag}
              onLostPointerCapture={(event) => clearBoardDrag(event.pointerId)}
              onClickCapture={(event) => {
                if (!suppressNextBoardClick.current) return;
                suppressNextBoardClick.current = false;
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              <CardContent className="workspace-panel">
                <ScrollArea
                  className="min-w-0 pb-3"
                  data-testid="cycle-board-scroll"
                  viewportRef={boardViewportRef}
                  viewportTestId="cycle-board-viewport"
                  scrollbarOrientation="horizontal"
                >
                  <div className="min-w-[960px]">
                    <div
                      className="grid items-start gap-3 text-xs"
                      style={gridStyle}
                    >
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
                              {(eventsForDate.get(date) ?? []).length === 1
                                ? ''
                                : 's'}
                            </p>
                          </header>
                          <div className="space-y-3 p-2">
                            {(eventsForDate.get(date) ?? []).map((event) => (
                              <section
                                key={event.eventId}
                                className="space-y-2"
                              >
                                <div className="flex items-center justify-between gap-2 px-1">
                                  <h2 className="truncate font-semibold text-foreground text-sm">
                                    {event.title}
                                  </h2>
                                  <Badge variant="outline" className="shrink-0">
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
                                              {shift.requirements.map(
                                                (requirement) => {
                                                  const assignments =
                                                    shift.assignments.filter(
                                                      (assignment) =>
                                                        assignment.roleId ===
                                                          requirement.roleId &&
                                                        assignment.status !==
                                                          'cancelled' &&
                                                        assignment.status !==
                                                          'declined',
                                                    );
                                                  const roleLabel =
                                                    props.data.roles.find(
                                                      (role) =>
                                                        role.id ===
                                                        requirement.roleId,
                                                    )?.name ?? 'Role';
                                                  const suggestionGroups =
                                                    recommendations(
                                                      shift,
                                                      props.data,
                                                    );
                                                  return (
                                                    <CycleBuilderCell
                                                      key={requirement.roleId}
                                                      shift={shift}
                                                      roleId={
                                                        requirement.roleId
                                                      }
                                                      roleLabel={roleLabel}
                                                      requiredCount={
                                                        requirement.requiredCount
                                                      }
                                                      assignments={assignments}
                                                      pickerVolunteers={candidates(
                                                        shift,
                                                        props.data,
                                                      )}
                                                      suggestions={
                                                        suggestionGroups.safe
                                                      }
                                                      needsResponseSuggestions={
                                                        suggestionGroups.needsResponse
                                                      }
                                                      conflictSuggestions={
                                                        suggestionGroups.conflicts
                                                      }
                                                      slotLabel={
                                                        slot.label ??
                                                        'this shift'
                                                      }
                                                      selectedVolunteerId={
                                                        props.selectedVolunteerId
                                                      }
                                                      selectedVolunteerName={
                                                        selectedName
                                                      }
                                                      isPublished={
                                                        event.state ===
                                                        'published'
                                                      }
                                                      onFocus={() =>
                                                        setFocused({
                                                          label: `${roleLabel} · ${slot.label ?? 'Shift'}`,
                                                          ids: new Set(
                                                            shift.eligibleVolunteers.map(
                                                              (volunteer) =>
                                                                volunteer.volunteerId,
                                                            ),
                                                          ),
                                                        })
                                                      }
                                                      onSelect={
                                                        props.onSelectAssignment
                                                      }
                                                      onRemove={
                                                        props.onRemoveAssignment
                                                      }
                                                    />
                                                  );
                                                },
                                              )}
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
            <VolunteerPoolSidebar
              volunteers={volunteers}
              assignments={activeAssignments}
              roles={props.data.roles}
              selectedVolunteerId={props.selectedVolunteerId}
              onSelectVolunteer={props.onSelectVolunteer}
              focusedVolunteerIds={focused?.ids}
              focusLabel={focused?.label}
              onClearFocus={focused ? () => setFocused(null) : undefined}
            />
          </div>
        </DndContext>
      </div>
    </FormControlSizeProvider>
  );
}
