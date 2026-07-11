import { format, parse } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
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
  'data-testid': dataTestId,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = value
    ? parse(value, DATE_VALUE_FORMAT, new Date())
    : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
            )}
          />
        }
      >
        <CalendarIcon className="opacity-60" />
        {selected ? format(selected, 'PPP') : placeholder}
      </PopoverTrigger>
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
  );
}
