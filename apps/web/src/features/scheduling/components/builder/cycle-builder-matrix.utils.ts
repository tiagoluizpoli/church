import type { Active, Over } from '@dnd-kit/core';
import {
  type CycleBuilderAssignment,
  type CycleBuilderEligibleVolunteerSummary,
  type CycleBuilderEventSummary,
  type CycleBuilderShiftSummary,
  type CycleBuilderSlotSummary,
  isActiveAssignment,
} from '../../hooks/use-cycle-builder';
import {
  type CalendarDayKey,
  toCycleDayKey,
  toLocalDayKey,
} from '@/shared/utils/date';

export type DateSpanMode = 'starts' | 'ends' | 'within';

interface EventDayKeysInput {
  event: CycleBuilderEventSummary;
}

/**
 * Every calendar day an event covers, read in the viewer's timezone. A genuinely
 * multi-day event covers each day of its span and earns a column per day.
 *
 * The span must be measured in *local* days: a one-day event runs local midnight
 * → local 23:59, so measuring it in UTC days stretches it across two dates west
 * of UTC and grows a phantom column for the day after.
 */
export function eventDayKeys({ event }: EventDayKeysInput): CalendarDayKey[] {
  return enumerateDates({
    startDate: toLocalDayKey(event.startDate),
    endDate: toLocalDayKey(event.endDate),
  });
}

interface DeriveEventDatesInput {
  events: CycleBuilderEventSummary[];
}

export function deriveEventDates({
  events,
}: DeriveEventDatesInput): CalendarDayKey[] {
  const result = new Set<CalendarDayKey>();
  for (const event of events)
    for (const day of eventDayKeys({ event })) result.add(day);
  return [...result].sort();
}

interface EventOccursOnDayInput {
  event: CycleBuilderEventSummary;
  day: CalendarDayKey;
}

export function eventOccursOnDay({
  event,
  day,
}: EventOccursOnDayInput): boolean {
  return (
    toLocalDayKey(event.startDate) <= day && day <= toLocalDayKey(event.endDate)
  );
}

interface EventSlotsOnDayInput {
  event: CycleBuilderEventSummary;
  day: CalendarDayKey;
}

/**
 * The event's slots served on one day. A multi-day event legitimately appears
 * in several columns, so each column must narrow to its own day's slots —
 * rendering the event's whole slot list in every column would put one shift on
 * several days, and an assignment made against it would look like it had landed
 * on all of them.
 */
export function eventSlotsOnDay({
  event,
  day,
}: EventSlotsOnDayInput): CycleBuilderSlotSummary[] {
  return event.slots.filter((slot) => toLocalDayKey(slot.startTime) === day);
}

interface EnumerateDatesInput {
  startDate: string;
  endDate: string;
}

/**
 * Every calendar day from `startDate` to `endDate` inclusive. Both bounds are
 * cycle bounds, so the walk is pure day arithmetic anchored at UTC — no local
 * offset is involved in either the input or the output.
 */
export function enumerateDates({
  startDate,
  endDate,
}: EnumerateDatesInput): CalendarDayKey[] {
  const dates: CalendarDayKey[] = [];
  const current = new Date(`${toCycleDayKey(startDate)}T00:00:00.000Z`);
  const end = new Date(`${toCycleDayKey(endDate)}T00:00:00.000Z`);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

interface IsDateWithinRangeInput {
  date: CalendarDayKey;
  rangeStart: string;
  rangeEnd: string;
}

/** Mirrors `isDateWithinRange` in tailoring's `cycle-list.utils.ts` — either
 * bound may be empty to leave that side open-ended. */
export function isDateWithinRange({
  date,
  rangeStart,
  rangeEnd,
}: IsDateWithinRangeInput): boolean {
  if (rangeStart && date < rangeStart) return false;
  if (rangeEnd && date > rangeEnd) return false;
  return true;
}

interface EventMatchesDateSpanInput {
  event: CycleBuilderEventSummary;
  mode: DateSpanMode;
  rangeStart: string;
  rangeEnd: string;
}

/** Same `starts`/`ends`/`within` mode as the tailoring cycle-list filter,
 * applied to an event's own span rather than a raw calendar date — a date
 * column has no separate start/end, so the mode only has an effect where
 * it's applied (event span), not on the enumerated all-cycle-dates list. */
export function eventMatchesDateSpan({
  event,
  mode,
  rangeStart,
  rangeEnd,
}: EventMatchesDateSpanInput): boolean {
  if (!rangeStart && !rangeEnd) return true;
  const start = toLocalDayKey(event.startDate);
  const end = toLocalDayKey(event.endDate);
  if (mode === 'starts')
    return isDateWithinRange({ date: start, rangeStart, rangeEnd });
  if (mode === 'ends')
    return isDateWithinRange({ date: end, rangeStart, rangeEnd });
  return (
    isDateWithinRange({ date: start, rangeStart, rangeEnd }) &&
    isDateWithinRange({ date: end, rangeStart, rangeEnd })
  );
}

interface WeekdayForDayKeyInput {
  day: CalendarDayKey;
}

/**
 * Weekday index of a calendar day. Anchored at local noon so the day cannot
 * slide across a midnight boundary under any offset or DST transition.
 */
export function weekdayForDayKey({ day }: WeekdayForDayKeyInput): number {
  return new Date(`${day}T12:00:00`).getDay();
}

interface FocusKeyInput {
  shiftId: string;
  roleId: string;
}

/**
 * Identity of one assignable place on the board. A slot can hold several shifts
 * and each shift asks for several roles, so only the pair identifies what the
 * rail is ranking for — focusing one cell must not light up its siblings.
 */
export function focusKey({ shiftId, roleId }: FocusKeyInput): string {
  return `${shiftId}:${roleId}`;
}

interface CountWorkloadInput {
  assignments: CycleBuilderAssignment[];
}

/** Active assignments per volunteer across the whole cycle (FR-017). */
export function countWorkload({
  assignments,
}: CountWorkloadInput): Map<string, number> {
  const workload = new Map<string, number>();
  for (const assignment of assignments)
    if (isActiveAssignment({ status: assignment.status }))
      workload.set(
        assignment.volunteerId,
        (workload.get(assignment.volunteerId) ?? 0) + 1,
      );
  return workload;
}

interface RankVolunteersForShiftRoleInput {
  shift: CycleBuilderShiftSummary;
  roleId: string;
  assignments: CycleBuilderAssignment[];
}

export interface ShiftRoleRanking {
  ids: string[];
  idealVolunteerId?: string;
}

const availabilityRank = (
  volunteer: CycleBuilderEligibleVolunteerSummary,
): number => (volunteer.hasConflict ? 2 : volunteer.isAvailable ? 0 : 1);

const lastServedAt = (
  volunteer: CycleBuilderEligibleVolunteerSummary,
): number =>
  volunteer.lastServedAt ? new Date(volunteer.lastServedAt).getTime() : 0;

/**
 * Rail ordering for one shift×role: whoever is available for *this* shift
 * first, then longest since served, then lightest cycle load, then name — the
 * same ranking `recommendations()` applies inside the picker, so a focused rail
 * and the picker never disagree about who the obvious pick is. People already
 * serving this shift drop out; they cannot take it twice.
 *
 * `idealVolunteerId` is the top of the ranking who is genuinely free — the
 * same bar `recommendations().safe` sets, so the badge always names someone the
 * picker would also recommend: available, unconflicted, and not already
 * serving elsewhere in the cycle. People who fail that bar keep their place in
 * the ranking; they just cannot wear the badge.
 */
export function rankVolunteersForShiftRole({
  shift,
  roleId,
  assignments,
}: RankVolunteersForShiftRoleInput): ShiftRoleRanking {
  const workload = countWorkload({ assignments });
  const assignedVolunteerIds = new Set(
    shift.assignments
      .filter((assignment) => isActiveAssignment({ status: assignment.status }))
      .map((assignment) => assignment.volunteerId),
  );
  // Qualification is a hard filter (FR-011): someone not qualified for this
  // role is not a candidate for it, and a ministry that has configured no
  // qualifications therefore has no candidates rather than every candidate.
  const ranked = shift.eligibleVolunteers
    .filter(
      (volunteer) =>
        volunteer.qualifiedRoleIds.includes(roleId) &&
        !assignedVolunteerIds.has(volunteer.volunteerId),
    )
    .sort(
      (left, right) =>
        availabilityRank(left) - availabilityRank(right) ||
        lastServedAt(left) - lastServedAt(right) ||
        (workload.get(left.volunteerId) ?? 0) -
          (workload.get(right.volunteerId) ?? 0) ||
        left.volunteerName.localeCompare(right.volunteerName),
    );

  return {
    ids: ranked.map((volunteer) => volunteer.volunteerId),
    idealVolunteerId: ranked.find(
      (volunteer) =>
        volunteer.isAvailable &&
        !volunteer.hasConflict &&
        (workload.get(volunteer.volunteerId) ?? 0) === 0,
    )?.volunteerId,
  };
}

/**
 * How well one volunteer fits one shift×role.
 *
 * `ready`    — qualified and genuinely free: the obvious drop target.
 * `override` — qualified but unavailable or double-booked. Still assignable;
 *              overriding is a real workflow, it just must not look routine —
 *              and FR-016 requires a reason before it is accepted, which is
 *              why the tier carries `conflictType` rather than leaving each
 *              caller to re-derive it. A caller holding the fit cannot drop
 *              the conflict on the floor without the compiler noticing.
 * `none`     — not qualified for this role, or not a candidate for this shift
 *              at all. The board must offer nothing here.
 */
export type ShiftRoleFit =
  | { tier: 'ready' }
  | { tier: 'override'; conflictType: SoftConflictType }
  | { tier: 'none' };

/** Mirrors the picker's own conflict vocabulary (`recommendations()`). */
export type SoftConflictType = 'double_booked' | 'unavailable';

interface VolunteerFitForShiftRoleInput {
  shift: CycleBuilderShiftSummary;
  roleId: string;
  volunteerId: string;
}

export function volunteerFitForShiftRole({
  shift,
  roleId,
  volunteerId,
}: VolunteerFitForShiftRoleInput): ShiftRoleFit {
  const volunteer = shift.eligibleVolunteers.find(
    (candidate) => candidate.volunteerId === volunteerId,
  );
  // Qualification is the same hard filter `rankVolunteersForShiftRole` applies
  // (FR-011); sharing the rule is what keeps the board's highlight and the
  // rail's ranking from contradicting each other.
  if (!volunteer?.qualifiedRoleIds.includes(roleId)) return { tier: 'none' };
  if (volunteer.isAvailable && !volunteer.hasConflict) return { tier: 'ready' };
  return {
    tier: 'override',
    conflictType: volunteer.hasConflict ? 'double_booked' : 'unavailable',
  };
}

/** Payload `VolunteerCard` puts on its dnd-kit draggable. */
export interface VolunteerDragData {
  volunteerId?: string;
}

/** Payload a board cell puts on its dnd-kit droppable. */
export interface CycleDropTargetData {
  shiftId?: string;
  roleId?: string;
  assignmentId?: string;
}

interface DraggedVolunteerIdInput {
  active: Active | null;
}

/**
 * Who is currently being dragged, if anyone. The id lives in the draggable's
 * `data`, not its `id` — a volunteer can be registered several times under
 * different drag ids (once per rail group), so `active.id` is not the person.
 */
export function draggedVolunteerId({
  active,
}: DraggedVolunteerIdInput): string | undefined {
  const data = active?.data.current as VolunteerDragData | undefined;
  return data?.volunteerId;
}

interface DropTargetDataInput {
  over: Over | null;
}

export function dropTargetData({
  over,
}: DropTargetDataInput): CycleDropTargetData | undefined {
  return over?.data.current as CycleDropTargetData | undefined;
}
