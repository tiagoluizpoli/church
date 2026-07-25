import { CalendarDays, LocateFixed, XIcon } from 'lucide-react';
import type { CycleBuilderEventSummary } from '../../hooks/use-cycle-builder';
import { dateLabel, staffingStatusClasses } from './cycle-builder-matrix.utils';
import type { useDateStripDragScroll } from './use-cycle-board-drag-scroll';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

/**
 * The pinned "All dates" control. Shared by the two states because only one of
 * them is a button: with no date focused there is nothing to clear, and the
 * previous `disabled` + `disabled:opacity-100` rendered a dead control that
 * looked live and carried an `aria-pressed` it could never change (B-3).
 */
const DATE_STRIP_FOCUS_CLASS =
  'flex h-full min-w-32 flex-col items-center justify-center gap-1 rounded-lg border border-border border-dashed bg-card px-3 py-2 text-center text-muted-foreground text-sm';

interface CycleBuilderDateStripProps {
  selectedDate: string | null;
  onSelectedDateChange: (date: string | null) => void;
  dates: string[];
  eventsForDate: Map<string, CycleBuilderEventSummary[]>;
  dragScroll: ReturnType<typeof useDateStripDragScroll>;
}

/** The horizontal strip of per-date staffing cards, pinned next to the "All
 * dates" focus control. Drag-to-scroll comes from `useDateStripDragScroll`,
 * kept separate from the board's own drag-to-scroll (see that hook's doc
 * comment for why the two aren't unified). */
export function CycleBuilderDateStrip({
  selectedDate,
  onSelectedDateChange,
  dates,
  eventsForDate,
  dragScroll,
}: CycleBuilderDateStripProps) {
  return (
    <div className="flex items-stretch gap-2">
      {/* pb-3 matches the date strip's own scrollbar clearance so this
       * button stretches to the CARD height, not the card+scrollbar-gap
       * height — `items-stretch` above pins it to the row's tallest
       * child (the scroll area). */}
      <div className="shrink-0 pb-3">
        {selectedDate ? (
          <button
            type="button"
            data-testid="cycle-date-strip-focus"
            aria-label={`Showing ${dateLabel(selectedDate)} only — clear to show all dates`}
            onClick={() => onSelectedDateChange(null)}
            className={cn(
              DATE_STRIP_FOCUS_CLASS,
              'border-primary border-solid text-primary',
            )}
          >
            <XIcon className="size-4" />
            <span className="font-semibold text-foreground">
              {dateLabel(selectedDate)}
            </span>
            <span className="text-muted-foreground text-xs leading-tight">
              Show all dates
            </span>
          </button>
        ) : (
          <div
            data-testid="cycle-date-strip-focus"
            className={DATE_STRIP_FOCUS_CLASS}
          >
            <CalendarDays className="size-4" />
            <span className="font-semibold text-foreground">All dates</span>
            <span className="text-muted-foreground text-xs leading-tight">
              Select a day
            </span>
          </div>
        )}
      </div>
      <ScrollArea
        className="min-w-0 pb-3"
        data-testid="cycle-date-strip-scroll"
        viewportRef={dragScroll.viewportRef}
        viewportTestId="cycle-date-strip-viewport"
        scrollbarOrientation="horizontal"
      >
        <section
          className="flex min-h-10 touch-pan-y gap-2 pb-1"
          aria-label="Cycle dates"
          onPointerDown={dragScroll.onPointerDown}
          onPointerMove={dragScroll.onPointerMove}
          onPointerUp={dragScroll.onPointerUp}
          onPointerCancel={dragScroll.onPointerCancel}
        >
          {dates.map((date) => {
            const dayEvents = eventsForDate.get(date) ?? [];
            const assigned = dayEvents.reduce(
              (total, event) => total + event.assignedCount,
              0,
            );
            const required = dayEvents.reduce(
              (total, event) => total + event.requiredCount,
              0,
            );
            const percent = required
              ? Math.round((assigned / required) * 100)
              : 0;
            const selected = selectedDate === date;
            const staffing = staffingStatusClasses({
              percent,
              hasRequirement: required > 0,
            });
            return (
              <div
                key={date}
                data-selected={selected}
                className="relative min-w-48 flex-1 rounded-lg border border-border bg-card p-3 text-left data-[selected=true]:border-primary data-[selected=true]:bg-primary/5"
              >
                <span className="flex items-center justify-between font-semibold text-sm">
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-label={
                      selected
                        ? 'Show all dates'
                        : `Show only ${dateLabel(date)}`
                    }
                    onClick={() => onSelectedDateChange(selected ? null : date)}
                    className="-my-1 -ml-1 flex items-center gap-1.5 rounded-md p-1 text-foreground hover:bg-muted aria-pressed:text-primary"
                  >
                    {dateLabel(date)}
                    <LocateFixed className="size-3.5 text-muted-foreground" />
                  </button>
                  <span
                    className={cn('text-xs', staffing.text)}
                    data-testid="cycle-date-staffing-percent"
                  >
                    {percent}%
                  </span>
                </span>
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className={cn('block h-full', staffing.bar)}
                    style={{ width: `${percent}%` }}
                  />
                </span>
                <span className="mt-2 block text-muted-foreground text-xs">
                  {dayEvents.length} event
                  {dayEvents.length === 1 ? '' : 's'}
                </span>
              </div>
            );
          })}
        </section>
      </ScrollArea>
    </div>
  );
}
