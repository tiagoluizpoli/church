import { useTimezoneContext } from '../components/timezone-provider';
import { formatInTZ } from '../utils/date';

/**
 * Hook to access the Church Timezone and formatting utilities.
 */
export function useTimezone() {
  const { churchTimezone } = useTimezoneContext();

  /**
   * Formats a date in the Church Timezone.
   */
  const format = (date: Date | string | number, formatStr = 'PPpp') => {
    return formatInTZ(date, churchTimezone, formatStr);
  };

  return {
    churchTimezone,
    format,
  };
}
