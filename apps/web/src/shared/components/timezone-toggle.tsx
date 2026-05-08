import { Button } from '@base-fullstack-template/ui/components/button';
import { Clock, Globe } from 'lucide-react';
import { useTimezone } from '../hooks/use-timezone';

/**
 * Toggle component to switch between Church Time and User Local Time.
 */
export function TimezoneToggle() {
  const { toggleMode, isChurchTime } = useTimezone();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleMode}
      className="flex items-center gap-2"
    >
      {isChurchTime ? (
        <>
          <Globe className="h-4 w-4" />
          <span>Church Time</span>
        </>
      ) : (
        <>
          <Clock className="h-4 w-4" />
          <span>Local Time</span>
        </>
      )}
    </Button>
  );
}
