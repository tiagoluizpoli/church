import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import {
  type CalendarDay,
  enumerateCalendarDays,
  formatCalendarDayWithWeekday,
  formatWeekdayShort,
  now,
  parseCalendarDay,
  today,
} from '@church/time';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { memo, type PointerEvent, useEffect, useRef, useState } from 'react';
import { toCalendarDateString } from '../participation-prepare.utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useTimezone } from '@/shared/hooks/use-timezone';

export interface PrepareCalendarProps {
  /** Cycle bounds, `yyyy-MM-dd` or full ISO date-time — only the calendar
   * date portion is used. Every rendered cell is inside these bounds; the
   * leader can never drag or edit the bounds themselves (research.md R3). */
  cycleStartDate: string;
  cycleEndDate: string;
  /** Days with >=1 Event, from `buildEventDayMarkers`. These retain a marker
   * on the rendered day strip. */
  eventDayMarkers: Set<string>;
  /** The active day-filter, or `null` when no filter is applied. */
  selectedDate: string | null;
  onSelectedDateChange: (date: string | null) => void;
}

const SCROLL_STEP_PX = 240;

interface SnapToDayInput {
  days: Map<string, HTMLButtonElement>;
  position: number;
}

/** Rounds a scroll position to a day boundary, so the strip never opens on a half-cut day. */
function snapToDay({ days, position }: SnapToDayInput): number {
  const [first, second] = [...days.values()];
  const pitch = first && second ? second.offsetLeft - first.offsetLeft : 0;
  return pitch > 0 ? Math.round(position / pitch) * pitch : position;
}
const DRAG_THRESHOLD_PX = 4;

interface DayOfMonthInput {
  day: CalendarDay;
}

interface MoveFocusInput {
  fromIso: CalendarDay;
  delta: number;
}

/** `12` from a CalendarDay string — the compact, unpadded day-of-month this
 * strip has always shown (contrast `formatCalendarDay`'s zero-padded `dd`). */
function dayOfMonth({ day }: DayOfMonthInput): string {
  return String(Number(day.slice(8, 10)));
}

interface DragState {
  pointerId: number;
  startClientX: number;
  startScrollLeft: number;
  dayIso: string | null;
  hasDragged: boolean;
  captureElement: HTMLDivElement;
}

interface ClearDragStateParams {
  pointerId: number;
}

/** Horizontally-scrollable day strip (research.md R11) — replaces the prior
 * month-grid calendar. Three simultaneous, visually distinct layers survive
 * the swap unchanged in meaning (research.md R3): (1) every rendered cell is
 * inside the fixed cycle bounds — there is no cell to render outside them,
 * (2) event-day dot markers, (3) a ring/outline day-filter, never the solid
 * "committed date" fill used elsewhere. Hand-rolled pointer-event drag-scroll
 * with free momentum (no snap-to-day) and arrow-key roving focus — no
 * existing shadcn/carousel primitive fit this interaction (R11's resolved
 * shape decision); chevron buttons still reuse the existing `Button` +
 * lucide chevron-icon pattern this file already used for month navigation. */
function PrepareCalendarView({
  cycleStartDate,
  cycleEndDate,
  eventDayMarkers,
  selectedDate,
  onSelectedDateChange,
}: PrepareCalendarProps) {
  const { churchTimezone } = useTimezone();
  const churchDay = today({ instant: now(), timeZone: churchTimezone });
  const cycleStart = parseCalendarDay({
    value: toCalendarDateString(cycleStartDate),
  });
  const cycleEnd = parseCalendarDay({
    value: toCalendarDateString(cycleEndDate),
  });
  const days = enumerateCalendarDays({ start: cycleStart, end: cycleEnd });

  const stripRef = useRef<HTMLDivElement>(null);
  const dayButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const dragState = useRef<DragState | null>(null);
  const skipClickIso = useRef<string | null>(null);
  const [focusedIso, setFocusedIso] = useState<string>(
    selectedDate ??
      (churchDay >= cycleStart && churchDay <= cycleEnd
        ? churchDay
        : cycleStart),
  );

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    function revealCurrentDay() {
      const target = dayButtonRefs.current.get(selectedDate ?? churchDay);
      if (!strip) return;
      strip.tabIndex = -1;
      if (target && strip.clientWidth > 0)
        strip.scrollLeft = snapToDay({
          days: dayButtonRefs.current,
          position:
            target.offsetLeft - strip.clientWidth / 2 + target.clientWidth / 2,
        });
    }
    revealCurrentDay();
    // A resize (a block panel opening beside the list) keeps the strip's first day while
    // the current day stays in view: it clips at the end instead of re-centring.
    const observer = new ResizeObserver(() => {
      const target = dayButtonRefs.current.get(selectedDate ?? churchDay);
      if (
        strip &&
        target &&
        target.offsetLeft >= strip.scrollLeft &&
        target.offsetLeft + target.clientWidth <=
          strip.scrollLeft + strip.clientWidth
      )
        return;
      revealCurrentDay();
    });
    observer.observe(strip);
    return () => observer.disconnect();
  }, [churchDay, selectedDate]);
  const selectDay = (iso: string) => {
    onSelectedDateChange(selectedDate === iso ? null : iso);
  };

  const moveFocus = ({ fromIso, delta }: MoveFocusInput) => {
    const currentIndex = days.indexOf(fromIso);
    if (currentIndex === -1) return;
    const nextIndex = Math.min(
      Math.max(currentIndex + delta, 0),
      days.length - 1,
    );
    const nextIso = days[nextIndex];
    if (!nextIso) return;
    setFocusedIso(nextIso);
    const nextButton = dayButtonRefs.current.get(nextIso);
    nextButton?.focus();
    nextButton?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };

  const scrollByStep = (direction: 1 | -1) => {
    const strip = stripRef.current;
    if (!strip) return;
    strip.scrollLeft = snapToDay({
      days: dayButtonRefs.current,
      position: strip.scrollLeft + SCROLL_STEP_PX * direction,
    });
  };

  const clearDragState = ({ pointerId }: ClearDragStateParams) => {
    const captureElement = dragState.current?.captureElement;
    dragState.current = null;
    if (captureElement?.hasPointerCapture?.(pointerId)) {
      captureElement.releasePointerCapture(pointerId);
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const strip = stripRef.current;
    if (!strip) return;
    const dayButton = (event.target as HTMLElement).closest<HTMLButtonElement>(
      '[data-calendar-day]',
    );
    dragState.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startScrollLeft: strip.scrollLeft,
      dayIso: dayButton?.dataset.calendarDay ?? null,
      hasDragged: false,
      captureElement: event.currentTarget,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const strip = stripRef.current;
    const drag = dragState.current;
    if (!strip || !drag || drag.pointerId !== event.pointerId) return;
    if (event.buttons === 0) {
      clearDragState({ pointerId: event.pointerId });
      return;
    }
    const distance = event.clientX - drag.startClientX;
    if (Math.abs(distance) > DRAG_THRESHOLD_PX) {
      drag.hasDragged = true;
      strip.scrollLeft = drag.startScrollLeft - distance;
    }
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    clearDragState({ pointerId: event.pointerId });
    if (!drag.hasDragged && drag.dayIso) {
      skipClickIso.current = drag.dayIso;
      selectDay(drag.dayIso);
    }
  };

  return (
    <div data-testid="prepare-calendar" className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-touch"
        data-testid="prepare-calendar-scroll-left"
        aria-label={m.prepare_calendar_earlier()}
        onClick={() => scrollByStep(-1)}
      >
        <ChevronLeftIcon className="size-4" />
      </Button>

      <ScrollArea
        data-scroll-area="true"
        // The edge chip fades into the › chevron: more days, not a clipped one.
        className="min-w-0 flex-1 [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]"
        viewportRef={stripRef}
        viewportTestId="prepare-calendar-strip"
        // Desktop scrolls by the chevrons, wheel or drag; the bar is only noise there.
        scrollbarOrientation="horizontal"
        // Chevrons, swipe, wheel and drag scroll it; a bar under five days is only noise.
        scrollbarClassName="hidden"
      >
        <div
          data-testid="prepare-calendar-drag-surface"
          className="flex touch-pan-y gap-2 px-0.5 py-1"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={(event) =>
            clearDragState({ pointerId: event.pointerId })
          }
        >
          {days.map((iso) => {
            const hasEvent = eventDayMarkers.has(iso);
            const isDayFilter = selectedDate === iso;
            const isRovingTarget = focusedIso === iso;
            const fullDateLabel = formatCalendarDayWithWeekday({
              day: iso,
              locale: getLocale(),
            });

            return (
              <button
                key={iso}
                ref={(node) => {
                  if (node) dayButtonRefs.current.set(iso, node);
                  else dayButtonRefs.current.delete(iso);
                }}
                type="button"
                data-testid={`prepare-calendar-day-${iso}`}
                data-cycle-band="true"
                data-calendar-day={iso}
                data-has-event={hasEvent || undefined}
                data-day-filter={isDayFilter || undefined}
                aria-pressed={isDayFilter}
                aria-label={
                  hasEvent
                    ? m.prepare_calendar_has_events({ day: fullDateLabel })
                    : fullDateLabel
                }
                tabIndex={isRovingTarget ? 0 : -1}
                className={cn(
                  'radius-control relative flex size-11 shrink-0 flex-col items-center justify-center gap-0.5 border border-transparent bg-accent/60 font-normal text-sm leading-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background motion-reduce:transition-none',
                  hasEvent &&
                    "after:absolute after:top-1 after:right-1 after:size-1 after:rounded-full after:bg-primary after:content-['']",
                  iso < churchDay && 'bg-muted/40 text-muted-foreground',
                  iso === churchDay && 'ring-1 ring-primary',
                  isDayFilter && 'border-primary bg-accent',
                )}
                onClick={() => {
                  if (skipClickIso.current === iso) {
                    skipClickIso.current = null;
                    return;
                  }
                  setFocusedIso(iso);
                  selectDay(iso);
                }}
                onFocus={() => setFocusedIso(iso)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowLeft') {
                    event.preventDefault();
                    moveFocus({ fromIso: iso, delta: -1 });
                  } else if (event.key === 'ArrowRight') {
                    event.preventDefault();
                    moveFocus({ fromIso: iso, delta: 1 });
                  } else if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectDay(iso);
                  }
                }}
              >
                <span className="text-muted-foreground text-xs">
                  {iso === churchDay
                    ? m.prepare_today()
                    : formatWeekdayShort({ day: iso, locale: getLocale() })}
                </span>
                <span className="font-medium">{dayOfMonth({ day: iso })}</span>
              </button>
            );
          })}
        </div>
      </ScrollArea>

      <Button
        type="button"
        variant="ghost"
        size="icon-touch"
        data-testid="prepare-calendar-scroll-right"
        aria-label={m.prepare_calendar_later()}
        onClick={() => scrollByStep(1)}
      >
        <ChevronRightIcon className="size-4" />
      </Button>
    </div>
  );
}

/** Memoised: the prepare page re-renders on every filter change. */
export const PrepareCalendar = memo(PrepareCalendarView);
