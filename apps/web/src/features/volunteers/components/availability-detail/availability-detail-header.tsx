import { m } from '@church/i18n/messages';
import {
  calendarDaysBetween,
  now,
  parseCalendarDay,
  today,
} from '@church/time';
import { CircleCheck, Clock } from 'lucide-react';
import { MyScheduleLink } from './published-notice';
import { SECONDARY_TONE } from './style';
import { HeaderStatChip } from '@/components/header-stat-chip';
import { WorkspaceIntroPanel } from '@/components/workspace-page';
import type { AvailabilityAnswer } from '@/features/volunteers/hooks/use-availability-answer';
import { formatDeadlineCountdown } from '@/features/volunteers/lib/availability-format';
import { useTimezone } from '@/shared/hooks/use-timezone';
import {
  formatCalendarDateOnly,
  formatDayOf,
} from '@/shared/utils/church-time';

export interface AvailabilityDetailHeaderProps {
  answer: AvailabilityAnswer;
}

/** The standard workspace header: title, one instruction, and where the check stands. */
export function AvailabilityDetailHeader({
  answer,
}: AvailabilityDetailHeaderProps) {
  const { churchTimezone } = useTimezone();
  const { check, confirmed, allPublished } = answer;
  const daysLeft = check.answerBy
    ? calendarDaysBetween({
        start: today({ instant: now(), timeZone: churchTimezone }),
        end: parseCalendarDay({ value: check.answerBy }),
      })
    : null;
  const overdue = daysLeft !== null && daysLeft < 0;
  // The deadline chip carries the date, so the description stays one instruction.
  const description = check.readOnly
    ? m.availability_detail_read_only()
    : allPublished
      ? m.availability_detail_help_locked()
      : [
          m.availability_detail_help_covers(),
          overdue ? m.availability_detail_overdue_hint() : null,
        ]
          .filter(Boolean)
          .join(' ');

  return (
    <WorkspaceIntroPanel
      title={`${check.ministryName} · ${check.cycleName}`}
      description={description}
      autoFocusTitle
      aside={
        <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:max-w-2xl xl:justify-end">
          {allPublished && !check.readOnly ? (
            <HeaderStatChip
              testId="availability-published-chip"
              label={m.availability_detail_published_day()}
              value={<MyScheduleLink />}
            />
          ) : (
            <>
              {/* Mobile: the values speak for themselves, so both chips share one line. */}
              <HeaderStatChip
                testId="availability-answer-chip"
                label={m.availability_detail_summary()}
                labelClassName="max-md:sr-only"
                value={
                  confirmed ? (
                    <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
                      <CircleCheck aria-hidden className="size-3.5" />
                      {check.confirmedAt ? (
                        <time dateTime={check.confirmedAt}>
                          {m.availability_detail_confirmed_on({
                            date: formatDayOf({
                              value: check.confirmedAt,
                              timeZone: churchTimezone,
                            }),
                          })}
                        </time>
                      ) : (
                        m.availability_detail_confirmed()
                      )}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-yellow-700 dark:text-yellow-300">
                      <Clock aria-hidden className="size-3.5" />
                      {m.availability_detail_unconfirmed()}
                    </span>
                  )
                }
              />
              <HeaderStatChip
                testId="availability-deadline-chip"
                label={m.answers_deadline()}
                labelClassName="max-md:sr-only"
                value={
                  <>
                    {check.answerBy ? (
                      <time dateTime={check.answerBy} className="tabular-nums">
                        {formatCalendarDateOnly({ value: check.answerBy })}
                      </time>
                    ) : (
                      m.answers_no_deadline()
                    )}
                    {overdue ? (
                      <>
                        <span aria-hidden> · </span>
                        <span className="text-destructive">
                          {m.answers_overdue()}
                        </span>
                      </>
                    ) : daysLeft !== null && !check.readOnly ? (
                      <>
                        <span aria-hidden> · </span>
                        <span
                          className={
                            daysLeft <= 1
                              ? 'text-amber-700 dark:text-amber-300'
                              : SECONDARY_TONE
                          }
                        >
                          {formatDeadlineCountdown(daysLeft)}
                        </span>
                      </>
                    ) : null}
                  </>
                }
              />
            </>
          )}
          <AvailabilityCounters answer={answer} />
        </div>
      }
    />
  );
}

/** Where the cycle stands; the server counts the days, the live toggles fill in "available". */
interface AvailabilityCountersProps {
  answer: AvailabilityAnswer;
}

function AvailabilityCounters({ answer }: AvailabilityCountersProps) {
  const { counts } = answer.check;
  return (
    <>
      {counts.openDays > 0 ? (
        <HeaderStatChip
          testId="availability-available-days-chip"
          label={m.availability_detail_stat_days_available()}
          value={
            <span className="tabular-nums">
              {answer.live.availableDays}/{counts.openDays}
            </span>
          }
        />
      ) : null}
      {counts.openShifts > 0 ? (
        <HeaderStatChip
          testId="availability-available-shifts-chip"
          label={m.availability_detail_stat_available()}
          value={
            <span className="tabular-nums">
              {answer.live.availableShifts}/{counts.openShifts}
            </span>
          }
        />
      ) : null}
      {counts.pastDays > 0 ? (
        <HeaderStatChip
          testId="availability-past-days-chip"
          label={m.availability_detail_stat_past()}
          value={counts.pastDays}
        />
      ) : null}
      {counts.publishedDays > 0 ? (
        <HeaderStatChip
          testId="availability-published-days-chip"
          label={m.availability_detail_stat_published()}
          value={counts.publishedDays}
        />
      ) : null}
    </>
  );
}
