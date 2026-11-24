import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { formatWeekdayShort, parseCalendarDay } from '@church/time';
import { CheckIcon, XIcon } from 'lucide-react';
import {
  type KeyboardEvent,
  type MouseEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { useDateStripDragScroll } from '../../../hooks/use-cycle-board-drag-scroll';
import type { CycleBuilderEventSummary } from '../../../hooks/use-cycle-builder';
import { dateLabel } from '../../../utils/builder/cycle-builder-date.utils';
import { staffingStatusClasses } from '../../../utils/builder/cycle-builder-staffing.utils';
import { useFormControlSize } from '@/components/ui/form-control-size';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface CycleBuilderDateStripProps {
  /** Every selected day, including any the date filters currently hide. */
  selectedDates: string[];
  onSelectedDatesChange: (dates: string[]) => void;
  /** The chips: the cycle's dates left after the "Mostrar" and date filters. */
  dates: string[];
  eventsForDate: Map<string, CycleBuilderEventSummary[]>;
  dragScroll: ReturnType<typeof useDateStripDragScroll>;
}

interface DayStaffing {
  percent: number;
  hasRequirement: boolean;
  eventCount: number;
}

interface DayStaffingInput {
  events: CycleBuilderEventSummary[];
}

interface ChipKeyDownInput {
  event: KeyboardEvent<HTMLButtonElement>;
  date: string;
}

interface ToggleInput {
  date: string;
  range: boolean;
}

function dayStaffing({ events }: DayStaffingInput): DayStaffing {
  const required = events.reduce(
    (total, event) => total + event.peopleNeeded,
    0,
  );
  const assigned = events.reduce(
    (total, event) => total + event.fillRatio * event.peopleNeeded,
    0,
  );
  return {
    percent: required ? Math.round((assigned / required) * 100) : 0,
    hasRequirement: required > 0,
    eventCount: events.length,
  };
}

/**
 * The compact multi-select date rail. A plain click (or Space) toggles one
 * day; Shift+click (or Shift+Space) adds every chip from the last toggled one.
 * The chips are one `role="group"` tab stop with a roving tabindex, so 31 days
 * cost one Tab. The clear chip on the left stays the same element in both
 * states, so clearing never drops focus to the page.
 */
export function CycleBuilderDateStrip({
  selectedDates,
  onSelectedDatesChange,
  dates,
  eventsForDate,
  dragScroll,
}: CycleBuilderDateStripProps) {
  const isTouch = useFormControlSize() === 'touch';
  const locale = getLocale();
  const selected = useMemo(() => new Set(selectedDates), [selectedDates]);
  const anchorRef = useRef<string | null>(null);
  const chipRefs = useRef(new Map<string, HTMLButtonElement>());
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const tabStop =
    activeDate && dates.includes(activeDate)
      ? activeDate
      : (dates.find((date) => selected.has(date)) ?? dates[0]);
  const hiddenCount = selectedDates.filter(
    (date) => !dates.includes(date),
  ).length;
  const count = selectedDates.length;

  const toggle = ({ date, range }: ToggleInput) => {
    const anchor = anchorRef.current;
    const from = anchor ? dates.indexOf(anchor) : -1;
    const to = dates.indexOf(date);
    anchorRef.current = date;
    if (range && from !== -1) {
      const span = dates.slice(Math.min(from, to), Math.max(from, to) + 1);
      onSelectedDatesChange([...new Set([...selectedDates, ...span])].sort());
      return;
    }
    onSelectedDatesChange(
      selected.has(date)
        ? selectedDates.filter((day) => day !== date)
        : [...selectedDates, date].sort(),
    );
  };

  const clear = () => {
    anchorRef.current = null;
    if (count) onSelectedDatesChange([]);
  };

  const moveFocus = (date: string | undefined) => {
    if (!date) return;
    setActiveDate(date);
    chipRefs.current.get(date)?.focus();
  };

  const onChipKeyDown = ({ event, date }: ChipKeyDownInput) => {
    const index = dates.indexOf(date);
    switch (event.key) {
      case 'ArrowRight':
        moveFocus(dates[Math.min(index + 1, dates.length - 1)]);
        break;
      case 'ArrowLeft':
        moveFocus(dates[Math.max(index - 1, 0)]);
        break;
      case 'Home':
        moveFocus(dates[0]);
        break;
      case 'End':
        moveFocus(dates.at(-1));
        break;
      case ' ':
        // Handled here, not by the native click, so Shift+Space can range.
        toggle({ date, range: event.shiftKey });
        break;
      case 'Escape':
        clear();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div className="space-y-1">
      <div className="flex items-start gap-2">
        <button
          type="button"
          data-testid="cycle-date-strip-clear"
          aria-disabled={count === 0}
          aria-label={
            count === 0
              ? m.builder_ui_dates_showing_all()
              : count === 1
                ? m.builder_ui_dates_clear_one()
                : m.builder_ui_dates_clear_many({ count })
          }
          onClick={clear}
          onKeyDown={(event) => {
            if (event.key === 'Escape') clear();
          }}
          className={cn(
            'flex h-10 w-24 shrink-0 items-center justify-center gap-1 rounded-lg border px-2 font-semibold text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
            count === 0
              ? 'cursor-default border-border border-dashed bg-card text-muted-foreground'
              : 'border-primary bg-primary/10 text-primary hover:bg-primary/15',
            isTouch && 'h-11',
          )}
        >
          {count === 0 ? (
            m.builder_ui_dates_all_short()
          ) : (
            <>
              {count === 1
                ? m.builder_ui_dates_selected_short_one()
                : m.builder_ui_dates_selected_short_many({ count })}
              <XIcon aria-hidden className="size-3.5" />
            </>
          )}
        </button>
        <ScrollArea
          // The scrollbar lane: 8px on desktop, 4px under 44px touch chips, so the
          // block stays within 48px either way.
          className={cn('min-w-0 flex-1', isTouch ? 'pb-1' : 'pb-2')}
          data-testid="cycle-date-strip-scroll"
          viewportRef={dragScroll.viewportRef}
          viewportTestId="cycle-date-strip-viewport"
          scrollbarOrientation="horizontal"
          scrollbarClassName={
            isTouch ? 'data-horizontal:h-1' : 'data-horizontal:h-2'
          }
        >
          {/* biome-ignore lint/a11y/useSemanticElements: a fieldset needs a form legend and resets min-width, breaking the scroll rail; these toggle buttons are not form fields. */}
          <div
            role="group"
            aria-label={m.builder_ui_cycle_dates()}
            className="flex w-max touch-pan-y gap-1.5"
            onPointerDown={dragScroll.onPointerDown}
            onPointerMove={dragScroll.onPointerMove}
            onPointerUp={dragScroll.onPointerUp}
            onPointerCancel={dragScroll.onPointerCancel}
            onLostPointerCapture={dragScroll.onLostPointerCapture}
            onClickCapture={dragScroll.onClickCapture}
          >
            {dates.map((date) => {
              const staffing = dayStaffing({
                events: eventsForDate.get(date) ?? [],
              });
              const status = staffingStatusClasses(staffing);
              const isSelected = selected.has(date);
              const events =
                staffing.eventCount === 1
                  ? m.builder_ui_event_one()
                  : m.builder_ui_event_many({ count: staffing.eventCount });
              return (
                <Tooltip key={date}>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        ref={(node) => {
                          if (node) chipRefs.current.set(date, node);
                          else chipRefs.current.delete(date);
                        }}
                        data-testid="cycle-date-chip"
                        data-date={date}
                        aria-pressed={isSelected}
                        aria-label={m.builder_ui_date_chip_label({
                          date: dateLabel({ day: date, locale }),
                          staffing: staffing.hasRequirement
                            ? m.builder_ui_date_chip_staffed({
                                percent: staffing.percent,
                              })
                            : m.builder_ui_date_chip_no_need(),
                          events,
                        })}
                        tabIndex={date === tabStop ? 0 : -1}
                        onFocus={() => setActiveDate(date)}
                        onClick={(event: MouseEvent<HTMLButtonElement>) =>
                          toggle({ date, range: event.shiftKey })
                        }
                        onKeyDown={(event) => onChipKeyDown({ event, date })}
                        className={cn(
                          'relative flex h-10 shrink-0 items-center gap-1.5 overflow-hidden rounded-lg border border-border bg-card pr-2.5 pl-2 text-sm outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50',
                          'aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:hover:bg-primary/15',
                          isTouch && 'h-11',
                        )}
                      >
                        {/* Always laid out, so pressing a chip never shifts its neighbours. */}
                        <CheckIcon
                          aria-hidden
                          className={cn(
                            'size-3.5 text-primary',
                            !isSelected && 'invisible',
                          )}
                        />
                        <span className="font-semibold text-foreground">
                          {formatWeekdayShort({
                            day: parseCalendarDay({ value: date }),
                            locale,
                          })}{' '}
                          {date.slice(8)}
                        </span>
                        <span
                          className={cn('text-xs tabular-nums', status.text)}
                          data-testid="cycle-date-staffing-percent"
                        >
                          {staffing.hasRequirement
                            ? `${staffing.percent}%`
                            : '—'}
                        </span>
                        {staffing.hasRequirement ? (
                          <span
                            aria-hidden
                            className={cn(
                              'absolute bottom-0 left-0 h-0.5',
                              status.bar,
                            )}
                            style={{
                              width: `${Math.min(staffing.percent, 100)}%`,
                            }}
                          />
                        ) : null}
                      </button>
                    }
                  />
                  <TooltipContent>
                    {dateLabel({ day: date, locale })} · {events}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </ScrollArea>
      </div>
      {hiddenCount ? (
        <p
          className="text-muted-foreground text-xs"
          data-testid="cycle-date-strip-hidden"
        >
          {hiddenCount === 1
            ? m.builder_ui_dates_hidden_one()
            : m.builder_ui_dates_hidden_many({ count: hiddenCount })}
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {count === 0
          ? m.builder_ui_dates_showing_all()
          : count === 1
            ? m.builder_ui_dates_selected_one()
            : m.builder_ui_dates_selected_many({ count })}
      </p>
    </div>
  );
}
