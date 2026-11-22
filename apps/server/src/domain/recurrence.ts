import {
  addCalendarDays,
  type CalendarDay,
  enumerateCalendarDays,
  weekdayIndex,
} from '@church/time';
import { InvalidRecurrenceError } from './errors/invalid-recurrence';

/** 0 (Sunday) … 6 (Saturday). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type MonthlyRecurrenceEntry =
  | {
      kind: 'nthWeekday';
      ordinal: 1 | 2 | 3 | 4 | 5 | 'last';
      weekday: Weekday;
    }
  | { kind: 'dayOfMonth'; day: number }
  | { kind: 'lastDayOfMonth' };

/** How an EventTemplate repeats; monthly entries count on the calendar month, never the Cycle. */
export type Recurrence =
  | { kind: 'weekly'; weekdays: Weekday[] }
  | { kind: 'monthly'; entries: MonthlyRecurrenceEntry[] };

export interface AssertRecurrenceInput {
  recurrence: Recurrence;
}

function isWeekday(value: unknown): boolean {
  return (
    Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 6
  );
}

function isValidEntry(entry: MonthlyRecurrenceEntry): boolean {
  switch (entry?.kind) {
    case 'nthWeekday':
      return (
        isWeekday(entry.weekday) &&
        (entry.ordinal === 'last' ||
          (Number.isInteger(entry.ordinal) &&
            entry.ordinal >= 1 &&
            entry.ordinal <= 5))
      );
    case 'dayOfMonth':
      return Number.isInteger(entry.day) && entry.day >= 1 && entry.day <= 31;
    case 'lastDayOfMonth':
      return true;
    default:
      return false;
  }
}

/** Throws InvalidRecurrenceError unless the Recurrence names at least one valid weekday or entry. */
export function assertRecurrence({ recurrence }: AssertRecurrenceInput): void {
  const valid =
    recurrence?.kind === 'weekly'
      ? recurrence.weekdays.length > 0 && recurrence.weekdays.every(isWeekday)
      : recurrence?.kind === 'monthly' &&
        recurrence.entries.length > 0 &&
        recurrence.entries.every(isValidEntry);
  if (!valid) {
    throw new InvalidRecurrenceError();
  }
}

function dayOfMonth(day: CalendarDay): number {
  return Number(day.slice(8, 10));
}

interface DaysAheadInput {
  day: CalendarDay;
  days: number;
}

/** Whether `days` after `day` falls in a later month. */
function inLaterMonth({ day, days }: DaysAheadInput): boolean {
  return addCalendarDays({ day, days }).slice(0, 7) !== day.slice(0, 7);
}

interface EntryNamesDayInput {
  entry: MonthlyRecurrenceEntry;
  day: CalendarDay;
}

function entryNamesDay({ entry, day }: EntryNamesDayInput): boolean {
  switch (entry.kind) {
    case 'nthWeekday':
      return (
        weekdayIndex({ day }) === entry.weekday &&
        (entry.ordinal === 'last'
          ? inLaterMonth({ day, days: 7 })
          : Math.ceil(dayOfMonth(day) / 7) === entry.ordinal)
      );
    case 'dayOfMonth':
      return dayOfMonth(day) === entry.day;
    case 'lastDayOfMonth':
      return inLaterMonth({ day, days: 1 });
  }
}

export interface RecurrenceNamesDayInput {
  recurrence: Recurrence;
  day: CalendarDay;
}

/** Whether the Recurrence names this CalendarDay (a Church Timezone calendar day, ADR 0003). */
export function recurrenceNamesDay({
  recurrence,
  day,
}: RecurrenceNamesDayInput): boolean {
  return recurrence.kind === 'weekly'
    ? recurrence.weekdays.includes(weekdayIndex({ day }))
    : recurrence.entries.some((entry) => entryNamesDay({ entry, day }));
}

export interface ExpandRecurrenceInput {
  recurrence: Recurrence;
  start: CalendarDay;
  end: CalendarDay;
}

/** The CalendarDays from `start` to `end` inclusive the Recurrence names, ascending, each once. */
export function expandRecurrence({
  recurrence,
  start,
  end,
}: ExpandRecurrenceInput): CalendarDay[] {
  return enumerateCalendarDays({ start, end }).filter((day) =>
    recurrenceNamesDay({ recurrence, day }),
  );
}
