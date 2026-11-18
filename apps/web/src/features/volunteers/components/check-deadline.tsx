import { m } from '@church/i18n/messages';
import {
  type CalendarDay,
  calendarDaysBetween,
  parseCalendarDay,
} from '@church/time';
import type { ListAvailabilityChecks200ChecksItem } from '@/infrastructure/api/churchAPI.schemas';
import { formatCalendarDateOnly } from '@/shared/utils/church-time';

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

/** A pending check's Deadline, urgent within three Church days and overdue after it.
 * Answers stay open past the Deadline until the Cycle ends, so overdue still invites one. */
export function CheckDeadline({ check, churchDay }: CheckDeadlineProps) {
  if (!check.answerBy)
    return (
      <p className="text-muted-foreground">
        {m.availability_list_no_deadline()}
      </p>
    );
  const date = formatCalendarDateOnly({ value: check.answerBy });
  const days = calendarDaysBetween({
    start: churchDay,
    end: parseCalendarDay({ value: check.answerBy }),
  });
  return (
    <p
      className={
        days < 0
          ? 'font-medium text-destructive'
          : days <= DUE_SOON_DAYS
            ? 'font-medium text-yellow-700 dark:text-yellow-300'
            : 'text-muted-foreground'
      }
    >
      <time dateTime={check.answerBy}>{deadlineCopy({ date, days })}</time>
    </p>
  );
}
