import { m } from '@church/i18n/messages';
import { ChevronRight, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { AvailabilityDay } from './availability-day';
import { SECONDARY_TONE } from './style';
import type { AvailabilityAnswer } from '@/features/volunteers/hooks/use-availability-answer';
import type { GetAvailabilityCheck200DaysItem } from '@/infrastructure/api/churchAPI.schemas';
import { cn } from '@/lib/utils';

type CheckDay = GetAvailabilityCheck200DaysItem;

export interface AvailabilityDayListProps {
  answer: AvailabilityAnswer;
  idPrefix: string;
}

/** Days still to answer first; past and already-published days fold away around them. */
export function AvailabilityDayList({
  answer,
  idPrefix,
}: AvailabilityDayListProps) {
  const { days } = answer.check;
  const past = days.filter((day) => day.state === 'past');
  const open = days.filter((day) => day.state === 'open');
  const published = days.filter((day) => day.state === 'published');
  // With nothing open, the published days are the page, not a fold.
  const shown = open.length > 0 ? open : published;
  const grid = (entries: CheckDay[]) => (
    <DayGrid entries={entries} answer={answer} idPrefix={idPrefix} />
  );
  return (
    <div className="space-y-6 md:space-y-4">
      {past.length > 0 ? (
        <DayFold
          summary={
            past.length === 1
              ? m.availability_detail_past_days_one()
              : m.availability_detail_past_days({ count: past.length })
          }
        >
          {grid(past)}
        </DayFold>
      ) : null}
      {grid(shown)}
      {open.length > 0 && published.length > 0 ? (
        <DayFold
          summary={
            published.length === 1
              ? m.availability_detail_published_days_one()
              : m.availability_detail_published_days({
                  count: published.length,
                })
          }
        >
          <p
            className={cn(
              'flex items-center gap-1.5 text-sm md:text-xs',
              SECONDARY_TONE,
            )}
          >
            <Lock aria-hidden className="size-3.5 shrink-0" />
            {m.availability_detail_help_locked()}
          </p>
          {grid(published)}
        </DayFold>
      ) : null}
    </div>
  );
}

interface DayGridProps {
  entries: CheckDay[];
  answer: AvailabilityAnswer;
  idPrefix: string;
}

/** Desktop days fill row by row, so the month reads left to right, then down. */
function DayGrid({ entries, answer, idPrefix }: DayGridProps) {
  return (
    <div className="space-y-7 md:grid md:grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] md:items-start md:gap-x-10 md:gap-y-4 md:space-y-0">
      {entries.map((day) => (
        <AvailabilityDay
          key={day.date}
          day={day}
          answer={answer}
          idPrefix={idPrefix}
        />
      ))}
    </div>
  );
}

interface DayFoldProps {
  summary: string;
  children: ReactNode;
}

function DayFold({ summary, children }: DayFoldProps) {
  return (
    <details className="group">
      <summary
        className={cn(
          'radius-control flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm hover:text-foreground md:min-h-8 md:text-xs [&::-webkit-details-marker]:hidden',
          SECONDARY_TONE,
        )}
      >
        <ChevronRight
          aria-hidden
          className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        {summary}
      </summary>
      <div className="space-y-3 pt-3">{children}</div>
    </details>
  );
}
