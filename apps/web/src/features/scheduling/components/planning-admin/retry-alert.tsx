import { m } from '@church/i18n/messages';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface RetryAlertProps {
  message: string;
  testId: string;
  onRetry: () => void;
  disabled?: boolean;
  className?: string;
}

/** A failed read with its Retry action. */
export function RetryAlert({
  message,
  testId,
  onRetry,
  disabled,
  className,
}: RetryAlertProps) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-3', className)}
      role="alert"
      data-testid={testId}
    >
      <p className="text-destructive text-sm">{message}</p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={onRetry}
      >
        {m.event_templates_retry()}
      </Button>
    </div>
  );
}
