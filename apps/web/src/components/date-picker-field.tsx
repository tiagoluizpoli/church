import {
  formatCalendarDay,
  fromPickerDate,
  now,
  parseCalendarDay,
  today,
  toPickerDate,
} from '@church/time';
import { CalendarIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import type { DateAfter, DateBefore } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { useFormControlSize } from '@/components/ui/form-control-size';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const CALENDAR_START_YEAR =
  Number(today({ instant: now(), timeZone: 'UTC' }).slice(0, 4)) - 10;
const CALENDAR_START_MONTH = toPickerDate({
  day: parseCalendarDay({ value: `${CALENDAR_START_YEAR}-01-01` }),
});
const CALENDAR_END_MONTH = toPickerDate({
  day: parseCalendarDay({ value: '3000-12-31' }),
});

interface PickerDateOfInput {
  /** `yyyy-MM-dd` */
  value: string;
}

/** The widget-local Date react-day-picker models this CalendarDay with. */
function pickerDateOf({ value }: PickerDateOfInput): Date {
  return toPickerDate({ day: parseCalendarDay({ value }) });
}

export interface DatePickerFieldProps {
  id?: string;
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** When provided, a value shows a clear (×) control that resets this
   * field alone — independent of any surrounding form's own save/apply
   * step. Omit for date fields that don't need an individual reset. */
  onClear?: () => void;
  /** Same `yyyy-MM-dd` shape as `value`. When set, days outside
   * `[minDate, maxDate]` are disabled in the calendar grid — an invalid
   * pick is never clickable, so there's nothing to validate after the
   * fact. Either bound may be omitted to leave that side open-ended. */
  minDate?: string;
  maxDate?: string;
  'data-testid'?: string;
}

/** shadcn's standard Calendar+Popover date picker (see shadcn `date-picker-demo`),
 * wired to this app's plain `yyyy-MM-dd` date strings — replaces the native
 * `<input type="date">` OS picker so the calendar surface matches the rest of
 * the design system in both themes. */
export function DatePickerField({
  id,
  value,
  onChange,
  placeholder = 'Pick a date',
  disabled = false,
  onClear,
  minDate,
  maxDate,
  'data-testid': dataTestId,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const formControlSize = useFormControlSize();
  const selected = value ? pickerDateOf({ value }) : undefined;
  const showClear = Boolean(onClear && value && !disabled);
  const disabledMatchers: (DateBefore | DateAfter)[] = [
    minDate
      ? ({ before: pickerDateOf({ value: minDate }) } satisfies DateBefore)
      : null,
    maxDate
      ? ({ after: pickerDateOf({ value: maxDate }) } satisfies DateAfter)
      : null,
  ].filter((matcher) => matcher !== null);

  return (
    // Explicit height on a wrapper around the *whole* Popover, not just the
    // trigger — `Popover.Root` renders no DOM of its own, so its children
    // (the trigger div below, plus base-ui's focus-guard/aria-owns `<span>`
    // elements injected while open) all land as direct siblings of each
    // other in whatever parent contains this component. Those spans are
    // `position: fixed` but still inflate that shared parent's flow height
    // a few px while open (same failure mode `Select`'s hidden autofill
    // `<input>` has), shoving `items-end` siblings in a filter row down.
    // Pinning the height here, one level up from the trigger, keeps every
    // sibling injected by Popover contained and immune to that.
    <div
      className={cn('relative', formControlSize === 'touch' ? 'h-11' : 'h-8')}
    >
      <Popover open={open} onOpenChange={setOpen}>
        {/* `flex` (not just `relative`, a plain block box) — a block
         * container's inline-level children (the trigger Button is
         * `inline-flex`) get laid out via baseline/line-box rules, which
         * silently reserves a few px of descender space below the button
         * and pushes it lower than sibling controls (`SelectTrigger`, which
         * has no such wrapper) under `items-end`. A flex container lays the
         * button out directly, with no anonymous line box to misalign
         * against. */}
        <div className="relative flex h-full">
          <PopoverTrigger
            data-testid={dataTestId}
            render={
              <Button
                id={id}
                type="button"
                variant="outline"
                disabled={disabled}
                className={cn(
                  'w-full justify-start font-normal',
                  !value && 'text-muted-foreground',
                  showClear && 'pe-8',
                )}
              />
            }
          >
            <CalendarIcon className="opacity-60" />
            {value
              ? formatCalendarDay({ day: parseCalendarDay({ value }) })
              : placeholder}
          </PopoverTrigger>
          {showClear ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Clear date"
              data-testid={dataTestId ? `${dataTestId}-clear` : undefined}
              className="absolute top-1/2 right-1 -translate-y-1/2"
              onClick={(event) => {
                event.stopPropagation();
                onClear?.();
              }}
            >
              <XIcon />
            </Button>
          ) : null}
        </div>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            captionLayout="dropdown"
            startMonth={CALENDAR_START_MONTH}
            endMonth={CALENDAR_END_MONTH}
            selected={selected}
            defaultMonth={selected}
            disabled={
              disabledMatchers.length > 0 ? disabledMatchers : undefined
            }
            onSelect={(date) => {
              if (date) {
                onChange(fromPickerDate({ date }));
                setOpen(false);
              }
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
