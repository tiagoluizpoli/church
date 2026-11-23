import type { LucideIcon } from 'lucide-react';
import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type IconInputProps = React.ComponentProps<typeof Input> & {
  icon: LucideIcon;
  wrapperClassName?: string;
};

/** A text input with its icon inside the box, on the left, and a clearly visible focus ring. */
export function IconInput({
  icon: Icon,
  className,
  wrapperClassName,
  ...props
}: IconInputProps) {
  return (
    <div className={cn('relative min-w-0', wrapperClassName)}>
      <Icon
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        className={cn('pl-8 focus-visible:ring-2', className)}
        {...props}
      />
    </div>
  );
}

type IconInputFieldProps = Omit<IconInputProps, 'id'> & {
  label: string;
  hint?: string;
  /** Keeps the hint for assistive tech only, for a row repeated down a list; a refusal still shows. */
  hideHint?: boolean;
  /** The field's refusal; marks the input invalid and describes it. */
  error?: string;
};

/** The one labelled form field of an icon input: label, input, then its hint or its error. */
export function IconInputField({
  label,
  hint,
  hideHint,
  error,
  ...inputProps
}: IconInputFieldProps) {
  const id = React.useId();
  const describedBy = error || hint ? `${id}-description` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="font-medium text-sm">
        {label}
      </Label>
      <IconInput
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...inputProps}
      />
      {describedBy ? (
        <p
          id={describedBy}
          className={cn(
            'text-sm',
            error ? 'text-destructive' : 'text-muted-foreground',
            hideHint && !error && 'sr-only',
          )}
        >
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
}
