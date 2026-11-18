import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import {
  type CalendarDay,
  calendarDaysBetween,
  formatDayLabel,
  parseCalendarDay,
} from '@church/time';
import type { ListAvailabilityChecks200ChecksItem } from '@/infrastructure/api/churchAPI.schemas';

/** Days left at which a pending Deadline turns amber. */
const DUE_SOON_DAYS = 3;

interface CheckDeadlineProps {
  check: ListAvailabilityChecks200ChecksItem;
  churchDay: CalendarDay;
}

interface DeadlineCopyInput {
  date: string;
  days: number;
}

function deadlineCopy({ date, days }: DeadlineCopyInput): string {
  if (days < 0) return m.availability_list_overdue({ date });
  if (days === 0) return m.availability_list_due_today();
  if (days === 1) return m.availability_list_due_tomorrow();
  if (days <= DUE_SOON_DAYS)
    return m.availability_list_due_in_days({ date, days });
  return m.availability_list_answer_by({ date });
}

/** A pending check's Deadline, amber within three Church days and once overdue.
 * Answers stay open past the Deadline until the Cycle ends, so overdue still invites one. */
export function CheckDeadline({ check, churchDay }: CheckDeadlineProps) {
  if (!check.answerBy)
    return (
      <p className="text-muted-foreground">
        {m.availability_list_no_deadline()}
      </p>
    );
  const answerBy = parseCalendarDay({ value: check.answerBy });
  const days = calendarDaysBetween({ start: churchDay, end: answerBy });
  // Volunteers plan by weekday ("sex 20 nov"); the year only when it is not this one.
  const label = formatDayLabel({ day: answerBy, locale: getLocale() });
  const date =
    answerBy.slice(0, 4) === churchDay.slice(0, 4)
      ? label
      : `${label} ${answerBy.slice(0, 4)}`;
  return (
    <p
      className={
        // Amber, not red: an overdue check is still open, so it needs attention, not alarm.
        days <= DUE_SOON_DAYS
          ? 'font-semibold text-amber-700 dark:text-amber-300'
          : 'text-muted-foreground'
      }
    >
      <time dateTime={check.answerBy}>{deadlineCopy({ date, days })}</time>
    </p>
  );
}
