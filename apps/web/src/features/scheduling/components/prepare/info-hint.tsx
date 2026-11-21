import { InfoIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export interface InfoHintProps {
  /** Names the button: what the hint explains. */
  label: string;
  children: string;
  /** Shows the label beside the icon, for a hint not next to its term. */
  withText?: boolean;
}

/** A keyboard-reachable info button whose popover explains one term. */
export function InfoHint({ label, children, withText = false }: InfoHintProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size={withText ? 'default' : 'icon-touch'}
            className={
              withText
                ? 'min-h-11 text-muted-foreground md:min-h-8'
                : 'text-muted-foreground md:size-8'
            }
            aria-label={withText ? undefined : label}
          />
        }
      >
        <InfoIcon className="size-4" aria-hidden="true" />
        {withText ? label : null}
      </PopoverTrigger>
      <PopoverContent className="text-sm leading-relaxed">
        {children}
      </PopoverContent>
    </Popover>
  );
}
