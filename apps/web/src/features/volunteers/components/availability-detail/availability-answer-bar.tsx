import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { formatDayLabel, parseCalendarDay } from '@church/time';
import { useId } from 'react';
import {
  AvailabilityAnswerActions,
  AvailabilityAnswerStatus,
} from './availability-answer-actions';
import { jumpToDay } from './day-anchor';
import { SECONDARY_TONE } from './style';
import type { AvailabilityAnswer } from '@/features/volunteers/hooks/use-availability-answer';

export interface AvailabilityAnswerBarProps {
  answer: AvailabilityAnswer;
  idPrefix: string;
}

/**
 * Below lg: the answer in one line and the send buttons. Mobile fixes it to the
 * viewport; from md it is the days panel's flush sticky footer. Same rows in
 * every state, so the first change never grows the bar over a row.
 */
export function AvailabilityAnswerBar({
  answer,
  idPrefix,
}: AvailabilityAnswerBarProps) {
  const markedDaysId = useId();
  const locale = getLocale();
  const markedDayNames = answer.markedDays
    .map((day) =>
      formatDayLabel({ day: parseCalendarDay({ value: day.date }), locale }),
    )
    .join(', ');
  const firstMarked = answer.markedDays[0];
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:sticky md:bottom-[calc(-1*var(--workspace-pad-y))] md:z-10 md:rounded-b-[inherit] md:px-(--workspace-panel-pad-lg) md:py-2">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-6">
        <div className="flex min-h-11 min-w-0 flex-col justify-center md:min-h-8">
          {firstMarked ? (
            <button
              type="button"
              aria-describedby={markedDaysId}
              className="radius-control self-start text-left font-medium text-sm underline decoration-foreground/40 underline-offset-3 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-ring"
              onClick={() =>
                jumpToDay({ prefix: idPrefix, date: firstMarked.date })
              }
            >
              {answer.summary}
            </button>
          ) : (
            <p className="font-medium text-sm">{answer.summary}</p>
          )}
          {answer.unsaved || firstMarked ? (
            <p className="truncate text-xs">
              {answer.unsaved ? (
                <span
                  role="status"
                  className="font-medium text-amber-700 dark:text-amber-300"
                >
                  {m.availability_detail_unsaved()}
                </span>
              ) : null}
              {answer.unsaved && firstMarked ? (
                <span aria-hidden> · </span>
              ) : null}
              {firstMarked ? (
                <span id={markedDaysId} className={SECONDARY_TONE}>
                  {markedDayNames}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
        <AvailabilityAnswerActions answer={answer} layout="row" />
      </div>
      <AvailabilityAnswerStatus answer={answer} />
    </div>
  );
}
