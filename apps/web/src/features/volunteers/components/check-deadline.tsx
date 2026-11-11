import { m } from '@church/i18n/messages';
import type { ListAvailabilityChecks200ChecksItem } from '@/infrastructure/api/churchAPI.schemas';
import { formatCalendarDateOnly } from '@/shared/utils/church-time';

interface CheckDeadlineProps {
  check: ListAvailabilityChecks200ChecksItem;
  churchDay: string;
}

export function CheckDeadline({ check, churchDay }: CheckDeadlineProps) {
  if (!check.answerBy) return null;
  const date = formatCalendarDateOnly({ value: check.answerBy });
  const overdue = check.answerBy < churchDay;
  return (
    <p
      className={
        overdue ? 'font-medium text-destructive' : 'text-muted-foreground'
      }
    >
      <time dateTime={check.answerBy}>
        {overdue
          ? m.availability_list_overdue({ date })
          : m.availability_list_answer_by({ date })}
      </time>
    </p>
  );
}
