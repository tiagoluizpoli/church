import type * as React from 'react';
import { cn } from '@/lib/utils';

interface HeaderStatChipProps {
  testId: string;
  label: string;
  labelClassName?: string;
  value: React.ReactNode;
  testIdOnValue?: boolean;
}
export function HeaderStatChip({
  testId,
  label,
  labelClassName,
  value,
  testIdOnValue = false,
}: HeaderStatChipProps) {
  return (
    <div
      className="radius-surface flex items-center gap-2 border border-border/70 bg-background/70 px-3 py-1.5 text-sm"
      data-testid={testIdOnValue ? undefined : testId}
    >
      <span className={cn('text-muted-foreground text-xs', labelClassName)}>
        {label}
      </span>
      <span
        className="font-medium text-xs"
        data-testid={testIdOnValue ? testId : undefined}
      >
        {value}
      </span>
    </div>
  );
}
