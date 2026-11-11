import { m } from '@church/i18n/messages';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface HomeErrorProps {
  message: string;
  onRetry: () => void;
}

/** A Home read failed: say so and offer a retry, never an empty or completed state. */
export function HomeError({ message, onRetry }: HomeErrorProps) {
  return (
    <Alert variant="destructive">
      <AlertDescription className="flex flex-wrap items-center gap-3">
        {message}
        <Button variant="outline" size="sm" onClick={onRetry}>
          {m.home_retry()}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
