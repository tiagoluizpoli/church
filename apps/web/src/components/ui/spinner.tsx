import { Loader2Icon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpinnerProps {
  className?: string;
}

/** Inline busy indicator for a control whose action is in flight. */
export function Spinner({ className }: SpinnerProps) {
  return (
    <Loader2Icon aria-hidden className={cn('size-4 animate-spin', className)} />
  );
}
