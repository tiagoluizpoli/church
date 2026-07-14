import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { type PointerEvent, useRef, useState } from 'react';
import {
  parseCalendarDate,
  toIsoDateString,
} from '../participation-tailoring.utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export interface TailoringCalendarProps {
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

const WEEKDAY_ABBREVIATIONS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Screen readers only get the weekday abbreviation + day-of-month from the
 * visible cell (e.g. "Wed 12"), which is ambiguous once a cycle spans a
 * month boundary. `aria-label` carries the full date instead. */
const FULL_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

const SCROLL_STEP_PX = 240;
const DRAG_THRESHOLD_PX = 4;

function enumerateDays(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
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
export function TailoringCalendar({
  cycleStartDate,
  cycleEndDate,
  eventDayMarkers,
  selectedDate,
  onSelectedDateChange,
}: TailoringCalendarProps) {
  const cycleStart = parseCalendarDate(cycleStartDate);
  const cycleEnd = parseCalendarDate(cycleEndDate);
  const days = enumerateDays(cycleStart, cycleEnd);

  const stripRef = useRef<HTMLDivElement>(null);
  const dayButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const dragState = useRef<DragState | null>(null);
  const skipClickIso = useRef<string | null>(null);
  const [focusedIso, setFocusedIso] = useState<string>(
    selectedDate ?? toIsoDateString(cycleStart),
  );

  const selectDay = (iso: string) => {
    onSelectedDateChange(selectedDate === iso ? null : iso);
  };

  const moveFocus = (fromIso: string, delta: number) => {
    const currentIndex = days.findIndex(
      (day) => toIsoDateString(day) === fromIso,
    );
    if (currentIndex === -1) return;
    const nextIndex = Math.min(
      Math.max(currentIndex + delta, 0),
      days.length - 1,
    );
    const nextIso = toIsoDateString(days[nextIndex]);
    setFocusedIso(nextIso);
    const nextButton = dayButtonRefs.current.get(nextIso);
    nextButton?.focus();
    nextButton?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };

  const scrollByStep = (direction: 1 | -1) => {
    const strip = stripRef.current;
    if (!strip) return;
    strip.scrollLeft += SCROLL_STEP_PX * direction;
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
    <div data-testid="tailoring-calendar" className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-touch"
        data-testid="tailoring-calendar-scroll-left"
        aria-label="Scroll to earlier days"
        onClick={() => scrollByStep(-1)}
      >
        <ChevronLeftIcon className="size-4" />
      </Button>

      <ScrollArea
        data-scroll-area="true"
        className="min-w-0 flex-1"
        viewportRef={stripRef}
        viewportTestId="tailoring-calendar-strip"
        viewportClassName="pb-3"
        scrollbarOrientation="horizontal"
        scrollbarClassName="mt-2"
      >
        <div
          data-testid="tailoring-calendar-drag-surface"
          className="flex touch-pan-y gap-2 px-0.5 py-1"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={(event) =>
            clearDragState({ pointerId: event.pointerId })
          }
        >
          {days.map((day) => {
            const iso = toIsoDateString(day);
            const hasEvent = eventDayMarkers.has(iso);
            const isDayFilter = selectedDate === iso;
            const isRovingTarget = focusedIso === iso;
            const fullDateLabel = FULL_DATE_FORMATTER.format(day);

            return (
              <button
                key={iso}
                ref={(node) => {
                  if (node) dayButtonRefs.current.set(iso, node);
                  else dayButtonRefs.current.delete(iso);
                }}
                type="button"
                data-testid={`tailoring-calendar-day-${iso}`}
                data-cycle-band="true"
                data-calendar-day={iso}
                data-has-event={hasEvent || undefined}
                data-day-filter={isDayFilter || undefined}
                aria-pressed={isDayFilter}
                aria-label={
                  hasEvent ? `${fullDateLabel}, has events` : fullDateLabel
                }
                tabIndex={isRovingTarget ? 0 : -1}
                className={cn(
                  'radius-control relative flex size-11 shrink-0 flex-col items-center justify-center gap-0.5 border border-transparent bg-accent/60 font-normal text-sm leading-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background motion-reduce:transition-none',
                  hasEvent &&
                    "after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary after:content-['']",
                  isDayFilter && 'border-primary bg-accent shadow-sm',
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
                    moveFocus(iso, -1);
                  } else if (event.key === 'ArrowRight') {
                    event.preventDefault();
                    moveFocus(iso, 1);
                  } else if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectDay(iso);
                  }
                }}
              >
                <span className="text-[10px] text-muted-foreground uppercase">
                  {WEEKDAY_ABBREVIATIONS[day.getDay()]}
                </span>
                <span className="font-medium">{day.getDate()}</span>
              </button>
            );
          })}
        </div>
      </ScrollArea>

      <Button
        type="button"
        variant="ghost"
        size="icon-touch"
        data-testid="tailoring-calendar-scroll-right"
        aria-label="Scroll to later days"
        onClick={() => scrollByStep(1)}
      >
        <ChevronRightIcon className="size-4" />
      </Button>
    </div>
  );
}
