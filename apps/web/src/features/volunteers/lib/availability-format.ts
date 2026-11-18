import { m } from '@church/i18n/messages';
import type { CheckShift } from './unavailable-shifts';
import {
  dayOf,
  formatInstantRangeOf,
  formatTimeOf,
} from '@/shared/utils/church-time';

export interface FormatShiftTimesInput {
  shift: CheckShift;
  timeZone: string;
}

/** `10:30 – 12:30` under its day heading; the full range only when it crosses midnight. */
export function formatShiftTimes({
  shift,
  timeZone,
}: FormatShiftTimesInput): string {
  const start = shift.startTime;
  const end = shift.endTime;
  return dayOf({ value: start, timeZone }) === dayOf({ value: end, timeZone })
    ? `${formatTimeOf({ value: start, timeZone })} – ${formatTimeOf({ value: end, timeZone })}`
    : formatInstantRangeOf({ start, end, timeZone });
}

/** "Faltam 8 dias" style countdown to the answer deadline. */
export function formatDeadlineCountdown(daysLeft: number): string {
  if (daysLeft === 0) return m.availability_detail_due_today();
  if (daysLeft === 1) return m.availability_detail_due_in_one();
  return m.availability_detail_due_in({ days: daysLeft });
}
