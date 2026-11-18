import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import {
  addCalendarDays,
  formatDayLabel,
  formatRelative,
  minutesBetween,
  now,
  parseInstant,
  today,
} from '@church/time';
import { dayOf } from '@/shared/utils/church-time';

interface AssignmentDayLabelInput {
  startTime: string;
  timeZone: string;
}

/** `Sun 12 Oct`, the day in the Church Timezone (ADR-0003), never the viewer's. */
export function assignmentDayLabel({
  startTime,
  timeZone,
}: AssignmentDayLabelInput): string {
  const day = dayOf({ value: startTime, timeZone });
  const locale = getLocale();
  return formatDayLabel({ day, locale });
}

/** `Today` / `Tomorrow` when the start falls on the Church's today or tomorrow, else null. */
export function relativeDayName({
  startTime,
  timeZone,
}: AssignmentDayLabelInput): string | null {
  const day = dayOf({ value: startTime, timeZone });
  const churchToday = today({ instant: now(), timeZone });
  if (day === churchToday) return m.my_schedule_today();
  if (day === addCalendarDays({ day: churchToday, days: 1 }))
    return m.my_schedule_tomorrow();
  return null;
}

interface StartsInInput {
  startTime: string;
  timeZone: string;
}

/** `em 40 minutos` / `em 16 horas` under two days, then `em 3 dias` by Church day; null once started. */
export function startsIn({
  startTime,
  timeZone,
}: StartsInInput): string | null {
  const instant = parseInstant({ value: startTime });
  const minutes = minutesBetween({ start: now(), end: instant });
  if (minutes <= 0) return null;
  const locale = getLocale();
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
  if (minutes < 60) return format.format(minutes, 'minute');
  if (minutes < 48 * 60) return format.format(Math.floor(minutes / 60), 'hour');
  return formatRelative({ instant, timeZone, locale });
}
