import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'lucide-react';
import type { DayButtonProps } from 'react-day-picker';
import { toIsoDateString } from '../participation-tailoring.utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

export interface TailoringCalendarProps {
  /** Cycle bounds, `yyyy-MM-dd` or full ISO date-time — only the calendar
   * date portion is used. Rendered as a fixed, non-interactive band; the
   * leader can never drag or edit it (research.md R3). */
  cycleStartDate: string;
  cycleEndDate: string;
  /** Days with >=1 Event, from `buildEventDayMarkers`. Only these days are
   * clickable for the day-filter. */
  eventDayMarkers: Set<string>;
  /** The active day-filter, or `null` when no filter is applied. */
  selectedDate: string | null;
  onSelectedDateChange: (date: string | null) => void;
}

function toLocalDate(value: string): Date {
  const datePart = value.slice(0, 10);
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Bounded calendar with three simultaneous, visually distinct layers
 * (research.md R3): (1) a fixed, non-interactive cycle-bounds band, (2)
 * event-day dot markers, (3) a ring/outline day-filter — never the solid
 * "committed date" fill `DatePickerField` uses elsewhere, since that
 * signifier means "saved" system-wide. Built on the shared shadcn
 * `Calendar` (react-day-picker) primitive, not a from-scratch component. */
export function TailoringCalendar({
  cycleStartDate,
  cycleEndDate,
  eventDayMarkers,
  selectedDate,
  onSelectedDateChange,
}: TailoringCalendarProps) {
  const cycleStart = toLocalDate(cycleStartDate);
  const cycleEnd = toLocalDate(cycleEndDate);
  const eventDayDates = [...eventDayMarkers].map((iso) => toLocalDate(iso));
  const selectedDateObj = selectedDate ? toLocalDate(selectedDate) : undefined;

  return (
    <div data-testid="tailoring-calendar">
      <Calendar
        startMonth={startOfMonth(cycleStart)}
        endMonth={startOfMonth(cycleEnd)}
        disabled={[{ before: cycleStart }, { after: cycleEnd }]}
        modifiers={{
          cycleBand: { from: cycleStart, to: cycleEnd },
          hasEvent: eventDayDates,
          dayFilter: selectedDateObj ? [selectedDateObj] : [],
        }}
        onDayClick={(day, modifiers) => {
          if (!modifiers.hasEvent) return;
          const iso = toIsoDateString(day);
          onSelectedDateChange(selectedDate === iso ? null : iso);
        }}
        components={{
          Chevron: ({ className: chevronClassName, orientation }) => {
            if (orientation === 'left') {
              return (
                <ChevronLeftIcon className={cn('size-4', chevronClassName)} />
              );
            }
            if (orientation === 'right') {
              return (
                <ChevronRightIcon className={cn('size-4', chevronClassName)} />
              );
            }
            return (
              <ChevronDownIcon className={cn('size-4', chevronClassName)} />
            );
          },
          DayButton: TailoringCalendarDayButton,
        }}
      />
    </div>
  );
}

function TailoringCalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: DayButtonProps) {
  const iso = toIsoDateString(day.date);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      data-testid={`tailoring-calendar-day-${iso}`}
      data-cycle-band={modifiers.cycleBand || undefined}
      data-has-event={modifiers.hasEvent || undefined}
      data-day-filter={modifiers.dayFilter || undefined}
      className={cn(
        'radius-control relative aspect-square h-8 w-8 font-normal leading-none',
        modifiers.cycleBand && 'bg-accent/60',
        modifiers.hasEvent &&
          "after:absolute after:bottom-0.5 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary after:content-['']",
        modifiers.dayFilter &&
          'ring-2 ring-primary ring-offset-1 ring-offset-background',
        className,
      )}
      {...props}
    >
      {day.date.getDate()}
    </Button>
  );
}
