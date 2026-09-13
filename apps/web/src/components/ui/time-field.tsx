import { useState } from 'react';
import {
  DateInput as DateInputPrimitive,
  DateSegment,
} from 'react-aria-components/DateField';
import {
  TimeField as TimeFieldPrimitive,
  type TimeFieldProps,
  type TimeValue,
} from 'react-aria-components/TimeField';
import { useFormControlSize } from '@/components/ui/form-control-size';
import { cn } from '@/lib/utils';

/* Installed with `shadcn add @intentui/time-field` — shadcn's own registry has
 * no time component at all, and @intentui is the registry this project already
 * declares in components.json.
 *
 * Retokened, as shadcn components are meant to be: the registry ships
 * intentui's palette (`text-fg`, `muted-fg`, `primary-subtle`, `danger-subtle`)
 * and none of those tokens exist in this project, which uses DESIGN.md's
 * shadcn vocabulary. Left as installed, the field renders unstyled. Its
 * `fieldStyles` import is dropped for the same reason — `ui/field.tsx` carries
 * the same absent tokens and has no importers anywhere in the app. */

export type { TimeValue };

export function TimeField<T extends TimeValue>({
  className,
  ...props
}: TimeFieldProps<T>) {
  return (
    <TimeFieldPrimitive
      {...props}
      data-slot="control"
      className={cn('relative block', className)}
    />
  );
}

export interface TimeInputProps {
  className?: string;
  /** Rendered inside the field, after the segments — the segments need about
   * 5ch, so the rest of the control is dead space worth using. */
  trailing?: React.ReactNode;
  /** Digits typed into the segment that currently holds the caret, reset every
   * time the caret moves. Reported upward so a combobox built on this field can
   * filter on what is *being* typed rather than on what is already committed. */
  onPendingDigitsChange?: (digits: string) => void;
  /** Supply this to drive the pending digits from outside — needed when
   * something other than typing changes the value, such as picking from a
   * list, which must clear them. Uncontrolled when omitted. */
  pendingDigits?: string;
}

/** Matches `ui/input.tsx` box for box, so a time field and a text field line up
 * in the same form row and respond to the same touch-size context.
 *
 * Renders a **half-typed segment as `1-` rather than `01`**. React Aria pads
 * the moment a digit lands, so typing a single `1` leaves the field reading
 * `01:00` — a complete, valid, and wrong time that looks committed. The dash
 * says the segment is still waiting for its second digit. The underlying value
 * is untouched; this is display only, and the padded form returns as soon as
 * the segment is settled. */
export function TimeInput({
  className,
  trailing,
  onPendingDigitsChange,
  pendingDigits,
}: TimeInputProps) {
  const size = useFormControlSize();
  const [uncontrolled, setUncontrolled] = useState('');
  const pending = pendingDigits ?? uncontrolled;

  const report = (digits: string) => {
    setUncontrolled(digits);
    onPendingDigitsChange?.(digits);
  };

  return (
    // `contents` so this wrapper carries the listeners without adding a box —
    // DateInputProps takes no capture handlers of its own, and the trailing
    // slot still positions against the TimeField above it.
    <span
      className="contents"
      // Focus moves between segments inside this element, so focusin both
      // fires here and tells us the caret has moved on to a fresh segment.
      onFocusCapture={() => report('')}
      onBlurCapture={() => report('')}
      onKeyDownCapture={(event) => {
        if (/^[0-9]$/.test(event.key)) {
          // A digit typed into an already-full segment starts it over, which is
          // what React Aria does to the value — append blindly and a minute
          // sitting on 30 turns the buffer into `301`, which matches no time at
          // all and silently empties the list.
          report(pending.length >= 2 ? event.key : pending + event.key);
          return;
        }
        if (event.key !== 'Tab' && event.key !== 'Shift') {
          report('');
        }
      }}
    >
      <DateInputPrimitive
        className={cn(
          'radius-control relative inline-flex w-full items-center border border-input bg-transparent px-2.5 py-1 tabular-nums transition-colors',
          'focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50',
          'aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20',
          'disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50',
          size === 'touch' ? 'h-11 px-3 text-base' : 'h-8 text-sm',
          trailing && 'pe-8',
          className,
        )}
      >
        {(segment) => (
          <DateSegment
            segment={segment}
            className={cn(
              'rounded px-0.5 outline-none',
              'focus:bg-primary focus:text-primary-foreground',
              'data-placeholder:text-muted-foreground',
            )}
          >
            {({ text, isFocused, isPlaceholder }) =>
              isFocused &&
              !isPlaceholder &&
              pending.length === 1 &&
              text.length === 2
                ? `${pending}-`
                : text
            }
          </DateSegment>
        )}
      </DateInputPrimitive>
      {trailing}
    </span>
  );
}
