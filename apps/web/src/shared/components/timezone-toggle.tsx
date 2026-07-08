import { Clock, Globe } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useTimezone } from '../hooks/use-timezone';
import { Button } from '@/components/ui/button';

interface TimezoneToggleProps {
  variant?: ComponentProps<typeof Button>['variant'];
  size?: ComponentProps<typeof Button>['size'];
}

/**
 * Toggle component to switch between Church Time and User Local Time.
 */
export function TimezoneToggle({
  variant = 'outline',
  size = 'sm',
}: TimezoneToggleProps = {}) {
  const { toggleMode, isChurchTime } = useTimezone();

  return (
    <Button
      variant={variant}
      size={size}
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
