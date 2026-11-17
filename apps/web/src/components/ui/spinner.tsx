import { Loader2Icon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Inline busy indicator for a control whose action is in flight. */
export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2Icon aria-hidden className={cn('size-4 animate-spin', className)} />
  );
}
