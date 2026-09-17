import {
  addCalendarDays,
  type CalendarDay,
  enumerateCalendarDays,
  formatDayAndMonth,
  formatTimeOfDay,
  formatWeekday,
  type Instant,
  isCalendarDay,
  millisecondsBetween,
  parseCalendarDay,
  parseInstant,
  today,
  weekdayIndex,
} from '@church/time';
import type {
  CycleBuilderEventSummary,
  CycleBuilderSlotSummary,
} from '../../hooks/use-cycle-builder';
import { churchTimeOfDay } from '@/shared/utils/church-time';

export interface ChurchDayOfInput {
  /** A CalendarDay (`yyyy-MM-dd`) or an Instant ISO string. */
  value: string;
  timeZone: string;
}

/**
 * CalendarDay a raw API value falls on in the Church Timezone — the one
 * grouping seam every date-deriving function below funnels through.
 *
 * Values already in `yyyy-MM-dd` form (cycle bounds) pass straight through —
 * they name a day, not a moment, and reading them through a timezone would
 * shift them a day at a non-zero offset. Everything else is an Instant, read
 * back onto a CalendarDay through the Church Timezone (never the browser's):
 * a 22:00 Friday → 01:00 Saturday event resolves to Friday, whoever is
 * looking and wherever they are.
 */
export function churchDayOf({
  value,
  timeZone,
}: ChurchDayOfInput): CalendarDay {
  if (isCalendarDay({ value })) return parseCalendarDay({ value });
  return today({ instant: parseInstant({ value }), timeZone });
}

export type DateMode = 'event_dates' | 'all_cycle_dates';
export type DateSpanMode = 'starts' | 'ends' | 'within';

export interface DateLabelInput {
  /** A CalendarDay, or a raw value `churchDayOf` can resolve to one. */
  day: string;
}

/** Compact `Mon, 04/01` column/label text. Built only from the seam's own
 * weekday name and day/month formatters — never a raw `Date` or the browser
 * locale. The weekday is trimmed to three letters for narrow columns; that is
 * plain string slicing of the seam's own English constant, not a locale
 * token. */
export function dateLabel({ day }: DateLabelInput): string {
  const calendarDay = parseCalendarDay({ value: day });
  return `${formatWeekday({ day: calendarDay }).slice(0, 3)}, ${formatDayAndMonth({ day: calendarDay })}`;
}

export interface TimeLabelInput {
  instant: string;
  timeZone: string;
}

/** `14:30`, read on the Church Timezone's wall clock. */
export function timeLabel({ instant, timeZone }: TimeLabelInput): string {
  return formatTimeOfDay({
    time: churchTimeOfDay({ value: instant, timeZone }),
  });
}

interface EventDayKeysInput {
  event: CycleBuilderEventSummary;
  timeZone: string;
}

/**
 * Every calendar day an event covers, read in the Church Timezone. A
 * genuinely multi-day event covers each day of its span and earns a column
 * per day.
 *
 * The span must be measured in Church-local days: a one-day event runs
 * church-local midnight → church-local 23:59, so measuring it in UTC days
 * stretches it across two dates west of UTC (and pulls it a day early east of
 * UTC) and grows a phantom column for the neighbouring day. A 22:00 Friday →
 * 01:00 Saturday Event still starts on Friday (US4, #151); its *own* slots
 * are placed under their start day by `eventSlotsOnDay` below, never dragged
 * onto the wrong column by a UTC/browser-timezone read.
 */
export function eventDayKeys({
  event,
  timeZone,
}: EventDayKeysInput): CalendarDay[] {
  return enumerateCalendarDays({
    start: churchDayOf({ value: event.startDate, timeZone }),
    end: churchDayOf({ value: event.endDate, timeZone }),
  });
}

interface DeriveEventDatesInput {
  events: CycleBuilderEventSummary[];
  timeZone: string;
}

export function deriveEventDates({
  events,
  timeZone,
}: DeriveEventDatesInput): CalendarDay[] {
  const result = new Set<CalendarDay>();
  for (const event of events)
    for (const day of eventDayKeys({ event, timeZone })) result.add(day);
  return [...result].sort();
}

interface EventSlotsOnDayInput {
  event: CycleBuilderEventSummary;
  day: string;
  timeZone: string;
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
  timeZone,
}: EventSlotsOnDayInput): CycleBuilderSlotSummary[] {
  return event.slots.filter(
    (slot) => churchDayOf({ value: slot.startTime, timeZone }) === day,
  );
}

interface EventOccursOnDayInput {
  event: CycleBuilderEventSummary;
  day: string;
  timeZone: string;
}

/**
 * Whether the event has real content to place under this day: a slot
 * starting there, or — for an event with no slots yet — its own start day,
 * so it still has somewhere to build.
 *
 * This is deliberately narrower than a raw `[start, end]` bounds check: an
 * Event's own bounds can cross church-local midnight (a 22:00 Friday → 01:00
 * Saturday session) without the Event earning a second, empty card on the far
 * side — it renders only under its start CalendarDay (US4, #151). A genuinely
 * multi-day event still earns a card on every day it has a slot on, via
 * `eventSlotsOnDay`.
 */
export function eventOccursOnDay({
  event,
  day,
  timeZone,
}: EventOccursOnDayInput): boolean {
  if (event.slots.length === 0) {
    return churchDayOf({ value: event.startDate, timeZone }) === day;
  }
  return eventSlotsOnDay({ event, day, timeZone }).length > 0;
}

interface EnumerateDatesInput {
  startDate: string;
  endDate: string;
}

/**
 * Every calendar day from `startDate` to `endDate` inclusive. Both bounds are
 * cycle bounds, so the walk is pure day arithmetic anchored at UTC — no
 * timezone is involved in either the input or the output.
 */
export function enumerateDates({
  startDate,
  endDate,
}: EnumerateDatesInput): CalendarDay[] {
  return enumerateCalendarDays({
    start: parseCalendarDay({ value: startDate }),
    end: parseCalendarDay({ value: endDate }),
  });
}

interface IsDateWithinRangeInput {
  date: string;
  rangeStart: string;
  rangeEnd: string;
}

/** Mirrors `isDateWithinRange` in tailoring's `cycle-list.utils.ts` — either
 * bound may be empty to leave that side open-ended. CalendarDay strings sort
 * lexicographically in calendar order, so plain comparison is exact. */
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
  timeZone: string;
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
  timeZone,
}: EventMatchesDateSpanInput): boolean {
  if (!rangeStart && !rangeEnd) return true;
  const start = churchDayOf({ value: event.startDate, timeZone });
  const end = churchDayOf({ value: event.endDate, timeZone });
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
  day: string;
}

/** Weekday index (0 Sunday … 6 Saturday) of a calendar day. Pure day
 * arithmetic on the seam's UTC-anchored CalendarDay — the day cannot slide
 * across a midnight boundary under any offset or DST transition. */
export function weekdayForDayKey({ day }: WeekdayForDayKeyInput): number {
  return weekdayIndex({ day: parseCalendarDay({ value: day }) });
}

interface WeekdayLongNameInput {
  /** 0 (Sunday) … 6 (Saturday), as returned by `weekdayForDayKey`. */
  weekday: number;
}

// 2024-01-07 is a Sunday; offsetting it by the weekday index lands on that
// weekday. Anchored through the seam's own CalendarDay arithmetic, never a
// local `Date`.
const WEEKDAY_NAME_ANCHOR_SUNDAY = parseCalendarDay({ value: '2024-01-07' });

/** The seam's English weekday name ("Sunday", "Monday", …) for a weekday
 * index. */
export function weekdayLongName({ weekday }: WeekdayLongNameInput): string {
  return formatWeekday({
    day: addCalendarDays({ day: WEEKDAY_NAME_ANCHOR_SUNDAY, days: weekday }),
  });
}

const EPOCH_INSTANT: Instant = parseInstant({
  value: '1970-01-01T00:00:00.000Z',
});

export interface LastServedMillisInput {
  lastServedAt: string | undefined;
}

/**
 * Epoch-ms recency key for "last served" sorts, treating a volunteer who has
 * never served (no `lastServedAt`) as served at the epoch — sorting first,
 * ahead of anyone with a real history. No raw `Date` involved.
 */
export function lastServedMillis({
  lastServedAt,
}: LastServedMillisInput): number {
  if (!lastServedAt) return 0;
  return millisecondsBetween({
    start: EPOCH_INSTANT,
    end: parseInstant({ value: lastServedAt }),
  });
}
