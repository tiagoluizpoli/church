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
}

/** Matches `ui/input.tsx` box for box, so a time field and a text field line up
 * in the same form row and respond to the same touch-size context. */
export function TimeInput({ className, trailing }: TimeInputProps) {
  const size = useFormControlSize();

  return (
    <>
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
          />
        )}
      </DateInputPrimitive>
      {trailing}
    </>
  );
}
