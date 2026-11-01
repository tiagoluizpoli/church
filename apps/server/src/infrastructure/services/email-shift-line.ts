import {
  formatDayLabel,
  formatTimeOfDay,
  type Instant,
  today,
  toTimeOfDay,
} from '@church/time';
import type { EmailLocale } from '../../domain/contracts/infrastructure/email-sender';

/** One Shift as an email line: actual bounds, never the EventTimeBlock's. */
export interface ShiftLineInput {
  startsAt: Instant;
  endsAt: Instant;
  eventTitle: string;
  roleName: string;
  sectorName: string;
  churchTimezone: string;
  locale: EmailLocale;
}

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
  ].join(' · ');
}
