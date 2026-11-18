import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { formatCalendarDayWithWeekday, parseCalendarDay } from '@church/time';
import { CircleX } from 'lucide-react';
import { useId } from 'react';
import {
  AvailabilityAnswerActions,
  AvailabilityAnswerStatus,
} from './availability-answer-actions';
import { jumpToDay } from './day-anchor';
import { SECONDARY_TONE } from './style';
import type { AvailabilityAnswer } from '@/features/volunteers/hooks/use-availability-answer';
import { formatShiftTimes } from '@/features/volunteers/lib/availability-format';
import { cn } from '@/lib/utils';
import { useTimezone } from '@/shared/hooks/use-timezone';

export interface AvailabilityAnswerPanelProps {
  answer: AvailabilityAnswer;
  idPrefix: string;
}

/** Desktop: the answer, every Shift it leaves out (by day) and the send buttons, beside the days. */
export function AvailabilityAnswerPanel({
  answer,
  idPrefix,
}: AvailabilityAnswerPanelProps) {
  const { churchTimezone } = useTimezone();
  const titleId = useId();
  const locale = getLocale();
  return (
    <aside
      aria-labelledby={titleId}
      data-testid="availability-answer-panel"
      // Fits the visible workspace: the viewport less the shell's top bar and the page padding.
      className="surface-panel sticky top-0 flex max-h-[calc(100dvh-var(--app-topbar-h)-2*var(--workspace-pad-y))] flex-col gap-3 p-4"
    >
      <div className="space-y-0.5">
        <h2 id={titleId} className={cn('font-medium text-xs', SECONDARY_TONE)}>
          {m.availability_detail_summary()}
        </h2>
        <p className="font-semibold text-sm">{answer.summary}</p>
        {answer.unsaved ? (
          <p
            role="status"
            className="font-medium text-amber-700 text-xs dark:text-amber-300"
          >
            {m.availability_detail_unsaved()}
          </p>
        ) : null}
      </div>
      {answer.hasMarks ? (
        <ul className="min-h-0 space-y-2.5 overflow-y-auto border-t pt-3">
          {answer.markedDays.map((day) => (
            <li key={day.date}>
              <button
                type="button"
                className="radius-control text-left font-medium text-xs underline decoration-foreground/30 underline-offset-3 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => jumpToDay(idPrefix, day.date)}
              >
                {formatCalendarDayWithWeekday({
                  day: parseCalendarDay({ value: day.date }),
                  locale,
                })}
              </button>
              <ul className="mt-1 space-y-1">
                {day.shifts.map((shift) => (
                  <li
                    key={shift.shiftId}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <CircleX
                      aria-hidden
                      className="size-3.5 shrink-0 text-destructive"
                    />
                    <span className="min-w-0 truncate">{shift.eventTitle}</span>
                    <span
                      className={cn(
                        'ml-auto shrink-0 tabular-nums',
                        SECONDARY_TONE,
                      )}
                    >
                      {formatShiftTimes({ shift, timeZone: churchTimezone })}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p className={cn('border-t pt-3 text-xs', SECONDARY_TONE)}>
          {m.availability_detail_panel_hint()}
        </p>
      )}
      <div className="border-t pt-3">
        <AvailabilityAnswerActions answer={answer} layout="stack" />
      </div>
      <AvailabilityAnswerStatus answer={answer} />
    </aside>
  );
}
