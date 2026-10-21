import {
  calendarDaysBetween,
  type WeekdayIndex,
  weekdayIndex,
} from './arithmetic';
import type { CalendarDay, Instant, TimeOfDay } from './brands';
import { capitalize } from './capitalize';
import { now } from './clock';
import { today, toTimeOfDay, toTimeOfDaySeconds } from './conversion';

/** Locales supported by the date/time seam. Declared here; never imports Paraglide. */
export type Locale = 'en' | 'pt-BR';

export interface CalendarDayFormatInput {
  day: CalendarDay;
}

export interface CalendarDayLocaleInput extends CalendarDayFormatInput {
  locale: Locale;
}

interface CalendarDayParts {
  year: string;
  month: string;
  dayOfMonth: string;
}

function splitCalendarDay({ day }: CalendarDayFormatInput): CalendarDayParts {
  // A CalendarDay is validated as `yyyy-MM-dd`, so the split always has three parts.
  const [year, month, dayOfMonth] = day.split('-') as [string, string, string];
  return { year, month, dayOfMonth };
}

/** `dd/MM/yyyy`. */
export function formatCalendarDay({ day }: CalendarDayFormatInput): string {
  const { year, month, dayOfMonth } = splitCalendarDay({ day });
  return `${dayOfMonth}/${month}/${year}`;
}

/** `Monday, 04/01/2027` / `Segunda-feira, 04/01/2027`. */
export function formatCalendarDayWithWeekday({
  day,
  locale,
}: CalendarDayLocaleInput): string {
  return `${formatWeekday({ day, locale })}, ${formatCalendarDay({ day })}`;
}

// UTC anchor date that falls on Sunday (weekday index 0); adding the index gives the right weekday.
// Using Date.UTC avoids any ambient-timezone shift of the reference day.
function weekdayAnchorDate(index: WeekdayIndex): Date {
  return new Date(Date.UTC(2024, 0, 7 + index));
}

interface WeekdayNameInput {
  index: WeekdayIndex;
  locale: Locale;
  style: 'long' | 'short';
}

function weekdayName({ index, locale, style }: WeekdayNameInput): string {
  const raw = new Intl.DateTimeFormat(locale, {
    weekday: style,
    timeZone: 'UTC',
  }).format(weekdayAnchorDate(index));
  return capitalize(raw);
}

/** `Monday` / `Segunda-feira`. Weekdays always start with a capital letter. */
export function formatWeekday({ day, locale }: CalendarDayLocaleInput): string {
  return weekdayName({ index: weekdayIndex({ day }), locale, style: 'long' });
}

/** `Mon` / `Seg.`. Short weekdays always start with a capital letter. */
export function formatWeekdayShort({
  day,
  locale,
}: CalendarDayLocaleInput): string {
  return weekdayName({ index: weekdayIndex({ day }), locale, style: 'short' });
}

export interface WeekdayByIndexInput {
  /** 0 (Sunday) … 6 (Saturday). */
  index: WeekdayIndex;
  locale: Locale;
}

/** Long weekday name for a 0–6 index. Capitalized. */
export function formatWeekdayOfIndex({
  index,
  locale,
}: WeekdayByIndexInput): string {
  return weekdayName({ index, locale, style: 'long' });
}

// shortcut: fixed lists for plural weekdays; Intl has no plural-weekday API, per ADR-0003 amendment.
const PLURAL_WEEKDAYS: Record<Locale, readonly string[]> = {
  en: [
    'Sundays',
    'Mondays',
    'Tuesdays',
    'Wednesdays',
    'Thursdays',
    'Fridays',
    'Saturdays',
  ],
  'pt-BR': [
    'Domingos',
    'Segundas-feiras',
    'Terças-feiras',
    'Quartas-feiras',
    'Quintas-feiras',
    'Sextas-feiras',
    'Sábados',
  ],
};

/** Plural weekday name for a 0–6 index (e.g. `Segundas-feiras`, `Mondays`). */
export function formatWeekdayPluralOfIndex({
  index,
  locale,
}: WeekdayByIndexInput): string {
  return PLURAL_WEEKDAYS[locale][index] ?? '';
}

/** `04/01`. */
export function formatDayAndMonth({ day }: CalendarDayFormatInput): string {
  const { month, dayOfMonth } = splitCalendarDay({ day });
  return `${dayOfMonth}/${month}`;
}

export interface TimeOfDayFormatInput {
  time: TimeOfDay;
}

/** `14:30`. A TimeOfDay is already `HH:mm`; this is the seam's naming of it. */
export function formatTimeOfDay({ time }: TimeOfDayFormatInput): string {
  return time;
}

export interface InstantFormatInput {
  instant: Instant;
  timeZone: string;
}

/** `04/01/2027 14:30`, read on the Church Timezone's wall clock. */
export function formatInstant({
  instant,
  timeZone,
}: InstantFormatInput): string {
  const day = today({ instant, timeZone });
  const time = toTimeOfDay({ instant, timeZone });
  return `${formatCalendarDay({ day })} ${formatTimeOfDay({ time })}`;
}

/** `04/01/2027 14:30:05`. Seconds only; never milliseconds. */
export function formatInstantPrecise({
  instant,
  timeZone,
}: InstantFormatInput): string {
  const day = today({ instant, timeZone });
  const time = toTimeOfDaySeconds({ instant, timeZone });
  return `${formatCalendarDay({ day })} ${time}`;
}

function daysFromNow({ instant, timeZone }: InstantFormatInput): number {
  const nowDay = today({ instant: now(), timeZone });
  const day = today({ instant, timeZone });
  return calendarDaysBetween({ start: nowDay, end: day });
}

export interface RelativeFormatInput extends InstantFormatInput {
  locale: Locale;
}

/**
 * `hoje` / `amanhã` / `ontem` / `em N dias` / `há N dias` (pt-BR) or
 * `today` / `tomorrow` / `yesterday` / `in N days` / `N days ago` (en).
 * Relative phrases never start with a capital letter.
 */
export function formatRelative({
  instant,
  timeZone,
  locale,
}: RelativeFormatInput): string {
  const dayDiff = daysFromNow({ instant, timeZone });
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
    dayDiff,
    'day',
  );
}

/**
 * Relative phrasing (as `formatRelative`) while the CalendarDay distance from
 * `now()` is under 7 days in either direction; the absolute CalendarDay once
 * it reaches 7.
 */
export function formatRecency({
  instant,
  timeZone,
  locale,
}: RelativeFormatInput): string {
  const dayDiff = daysFromNow({ instant, timeZone });
  if (Math.abs(dayDiff) < 7) {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
      dayDiff,
      'day',
    );
  }
  return formatCalendarDay({ day: today({ instant, timeZone }) });
}
