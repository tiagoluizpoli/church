import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { formatCalendarDayWithWeekday, parseCalendarDay } from '@church/time';
import { CircleX } from 'lucide-react';
import { AvailabilityShiftRow } from './availability-shift-row';
import { dayAnchorId } from './day-anchor';
import { PublishedNotice } from './published-notice';
import { SECONDARY_TONE } from './style';
import { Button } from '@/components/ui/button';
import { useFormControlSize } from '@/components/ui/form-control-size';
import type { AvailabilityAnswer } from '@/features/volunteers/hooks/use-availability-answer';
import type { GetAvailabilityCheck200DaysItem } from '@/infrastructure/api/churchAPI.schemas';
import { cn } from '@/lib/utils';

export interface AvailabilityDayProps {
  day: GetAvailabilityCheck200DaysItem;
  answer: AvailabilityAnswer;
  idPrefix: string;
}

/** One day: its heading, a whole-day shortcut when it has several open Shifts, and the Shifts. */
export function AvailabilityDay({
  day,
  answer,
  idPrefix,
}: AvailabilityDayProps) {
  const touch = useFormControlSize() === 'touch';
  const dayLabel = formatCalendarDayWithWeekday({
    day: parseCalendarDay({ value: day.date }),
    locale: getLocale(),
  });
  const open = day.shifts.filter((shift) => shift.answerable);
  const hasPublished = day.shifts.some((shift) => shift.published);
  const wholeDayUnavailable =
    open.length > 0 && open.every((shift) => !answer.isAvailable(shift));
  const status =
    day.state === 'published' ? (
      // The header says it once when every day is published.
      answer.allPublished ? null : (
        <PublishedNotice />
      )
    ) : open.length < 2 ? null : wholeDayUnavailable && !hasPublished ? (
      <p className="flex items-center gap-1.5 text-sm md:text-xs">
        <CircleX aria-hidden className="size-3.5 shrink-0 text-destructive" />
        <span className={SECONDARY_TONE}>
          {m.availability_detail_whole_day()}
        </span>
      </p>
    ) : (
      <p className={cn('text-sm tabular-nums md:text-xs', SECONDARY_TONE)}>
        {m.availability_detail_day_count({
          available: open.filter(answer.isAvailable).length,
          total: open.length,
        })}
      </p>
    );

  return (
    <section
      id={dayAnchorId(idPrefix, day.date)}
      aria-label={dayLabel}
      className="min-w-0 scroll-mt-24 md:max-w-xl"
    >
      {/* Desktop: one header height with or without the whole-day button, so columns line up. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b pb-2 md:min-h-7 md:pb-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h2 tabIndex={-1} className="font-semibold text-base md:text-sm">
            {dayLabel}
          </h2>
          {status}
        </div>
        {open.length > 1 ? (
          <Button
            variant="outline"
            size={touch ? undefined : 'xs'}
            aria-label={
              wholeDayUnavailable
                ? m.availability_detail_day_all_available({ day: dayLabel })
                : m.availability_detail_day_all_unavailable({ day: dayLabel })
            }
            disabled={answer.pending}
            className="max-md:h-auto max-md:min-h-11 max-md:whitespace-normal"
            onClick={() => answer.setDayUnavailable(day, !wholeDayUnavailable)}
          >
            <span className="md:hidden">
              {wholeDayUnavailable
                ? m.availability_detail_mark_day_available()
                : m.availability_detail_mark_day_unavailable()}
            </span>
            <span className="max-md:hidden">
              {wholeDayUnavailable
                ? m.availability_detail_mark_day_available_short()
                : m.availability_detail_mark_day_unavailable_short()}
            </span>
          </Button>
        ) : null}
      </div>
      {hasPublished && day.state === 'open' ? (
        <div className="pt-1.5 pb-1">
          <PublishedNotice />
        </div>
      ) : null}
      <ul className="divide-y">
        {day.shifts.map((shift) => (
          <AvailabilityShiftRow
            key={shift.shiftId}
            shift={shift}
            available={answer.isAvailable(shift)}
            id={`${idPrefix}-shift-${shift.shiftId}`}
            disabled={answer.pending}
            onToggle={() => answer.toggleShift(shift.shiftId)}
          />
        ))}
      </ul>
    </section>
  );
}
