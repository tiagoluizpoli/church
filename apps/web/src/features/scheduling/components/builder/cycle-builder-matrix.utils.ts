import type {
  CycleBuilderEventSummary,
  CycleBuilderSlotSummary,
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
