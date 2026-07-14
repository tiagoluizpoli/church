import { format, parse } from 'date-fns';
import { CalendarIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { useFormControlSize } from '@/components/ui/form-control-size';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const DATE_VALUE_FORMAT = 'yyyy-MM-dd';
const CALENDAR_START_MONTH = new Date(new Date().getFullYear() - 10, 0, 1);
const CALENDAR_END_MONTH = new Date(3000, 11, 31);

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
  'data-testid': dataTestId,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const formControlSize = useFormControlSize();
  const selected = value
    ? parse(value, DATE_VALUE_FORMAT, new Date())
    : undefined;
  const showClear = Boolean(onClear && value && !disabled);

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
            {selected ? format(selected, 'PPP') : placeholder}
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
            onSelect={(date) => {
              if (date) {
                onChange(format(date, DATE_VALUE_FORMAT));
                setOpen(false);
              }
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
