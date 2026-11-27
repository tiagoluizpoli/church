import {
  formatDayLabel,
  formatTimeOfDay,
  today,
  toTimeOfDay,
} from '@church/time';
import type {
  EventWhenInput,
  ShiftLineInput,
} from '../../domain/contracts/infrastructure/email-shift-line';

/**
 * `dom 12 out · 10:30–12:00 · Event · Role · Sector`: day, start–end on the
 * Church Timezone's 24-hour wall clock, Event title, Role, Sector. Plain text;
 * the layout escapes it.
 */
export function formatShiftLine({
  startsAt,
  endsAt,
  eventTitle,
  roleName,
  sectorName,
  churchTimezone: timeZone,
  locale,
}: ShiftLineInput): string {
  const day = today({ instant: startsAt, timeZone });
  const start = formatTimeOfDay({
    time: toTimeOfDay({ instant: startsAt, timeZone }),
  });
  const end = formatTimeOfDay({
    time: toTimeOfDay({ instant: endsAt, timeZone }),
  });
  return [
    formatDayLabel({ day, locale }),
    `${start}–${end}`,
    eventTitle,
    roleName,
    sectorName,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** `dom 12 out · 10:30–12:00`: an Event's day and span in the Church Timezone. */
export function formatEventWhen({
  start,
  end,
  churchTimezone: timeZone,
  locale,
}: EventWhenInput): string {
  const startDay = today({ instant: start, timeZone });
  const startTime = toTimeOfDay({ instant: start, timeZone });
  const endTime = toTimeOfDay({ instant: end, timeZone });
  const day = formatDayLabel({ day: startDay, locale });
  const from = formatTimeOfDay({ time: startTime });
  const to = formatTimeOfDay({ time: endTime });
  return `${day} · ${from}–${to}`;
}
