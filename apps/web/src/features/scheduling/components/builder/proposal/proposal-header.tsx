import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { CircleHelp } from 'lucide-react';
import { type KeyboardEvent, useState } from 'react';
import {
  type ProposalCoverage,
  percentOf,
} from '../../../utils/builder/assignment-proposal.utils';
import { dateLabel } from '../../../utils/builder/cycle-builder-date.utils';
import { staffingStatusClasses } from '../../../utils/builder/cycle-builder-staffing.utils';
import { AttentionTag, LoadOrdinal } from './proposal-parts';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface HowWeSuggestProps {
  heavyLoad: number;
  severeLoad: number;
  /** Only the tags this proposal actually shows get a legend entry. */
  showsOnlyOption: boolean;
  showsLoad: boolean;
}

/** The selection rule and the tag legend, on demand rather than taking
 * header height on every visit. */
export function HowWeSuggest({
  heavyLoad,
  severeLoad,
  showsOnlyOption,
  showsLoad,
}: HowWeSuggestProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="-mx-2 h-8 gap-1.5 text-muted-foreground text-sm hover:text-foreground"
          />
        }
      >
        <CircleHelp aria-hidden />
        {m.builder_proposal_how_title()}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 gap-3 p-4 text-sm">
        <PopoverTitle className="font-semibold text-sm">
          {m.builder_proposal_how_title()}
        </PopoverTitle>
        <p className="text-pretty">{m.builder_proposal_rule()}</p>
        {(showsOnlyOption || showsLoad) && (
          <ul className="space-y-2">
            {showsOnlyOption && (
              <li>
                <AttentionTag>{m.builder_proposal_only_option()}</AttentionTag>{' '}
                {m.builder_proposal_legend_only()}
              </li>
            )}
            {showsLoad && (
              <li>
                <LoadOrdinal
                  ordinal={heavyLoad}
                  total={heavyLoad}
                  heavyLoad={heavyLoad}
                  severeLoad={severeLoad}
                />{' '}
                {m.builder_proposal_legend_load({ count: heavyLoad })}
              </li>
            )}
            {showsLoad && (
              <li>
                <LoadOrdinal
                  ordinal={heavyLoad}
                  total={severeLoad}
                  heavyLoad={heavyLoad}
                  severeLoad={severeLoad}
                />{' '}
                {m.builder_proposal_legend_severe({ count: severeLoad })}
              </li>
            )}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

export interface DayStripDay {
  day: string;
  /** Present when the proposal touches the day. */
  coverage?: ProposalCoverage;
  /** The board has the day but this ministry serves no shift on it. */
  noShifts: boolean;
}

interface DayStripProps {
  days: DayStripDay[];
  /** Wrap (in the rail) instead of scrolling one row (in the header). */
  wrap?: boolean;
  onJump: (day: string) => void;
}

/** Every board day with its coverage after applying; one tab stop, arrow
 * keys move between days, and a day the proposal doesn't touch says why. */
export function DayStrip({ days, wrap = false, onJump }: DayStripProps) {
  const jumpable = days
    .filter(({ coverage }) => coverage)
    .map(({ day }) => day);
  const [active, setActive] = useState<string>();
  const current = active && jumpable.includes(active) ? active : jumpable[0];
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const index = jumpable.indexOf(current ?? '');
    const next =
      event.key === 'ArrowRight'
        ? jumpable[index + 1]
        : event.key === 'ArrowLeft'
          ? jumpable[index - 1]
          : event.key === 'Home'
            ? jumpable[0]
            : event.key === 'End'
              ? jumpable.at(-1)
              : undefined;
    if (!next) return;
    event.preventDefault();
    setActive(next);
    event.currentTarget
      .querySelector<HTMLElement>(`[data-day="${next}"]`)
      ?.focus();
  };
  return (
    <nav
      aria-label={m.builder_proposal_day_strip_label()}
      onKeyDown={onKeyDown}
      className={cn(
        '-mx-1 flex gap-1.5 px-1 pb-1',
        wrap ? 'flex-wrap' : 'overflow-x-auto',
      )}
    >
      {days.map(({ day, coverage, noShifts }) => {
        const label = dateLabel({ day, locale: getLocale() });
        if (!coverage)
          return (
            <span
              key={day}
              className="radius-control flex h-8 shrink-0 items-center gap-2 border border-dashed px-2.5 text-muted-foreground text-sm"
            >
              <span className="first-letter:uppercase">{label}</span>
              <span>
                {noShifts
                  ? m.builder_proposal_day_no_shifts()
                  : m.builder_proposal_day_no_changes()}
              </span>
            </span>
          );
        const percent = percentOf({
          covered: coverage.after,
          required: coverage.required,
        });
        const status = staffingStatusClasses({
          percent,
          hasRequirement: coverage.required > 0,
        });
        return (
          <button
            key={day}
            type="button"
            data-day={day}
            tabIndex={day === current ? 0 : -1}
            onFocus={() => setActive(day)}
            onClick={() => onJump(day)}
            className="radius-control flex h-8 shrink-0 items-center gap-2 border bg-background px-2.5 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              aria-hidden
              className={cn('size-2 rounded-full', status.bar)}
            />
            <span className="first-letter:uppercase">{label}</span>
            <span className="sr-only">, </span>
            <span className={cn('tabular-nums', status.text)}>{percent}%</span>
          </button>
        );
      })}
    </nav>
  );
}
