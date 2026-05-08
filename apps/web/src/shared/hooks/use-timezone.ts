import { useTimezoneContext } from '../components/timezone-provider';
import { formatInTZ } from '../utils/date';

/**
 * Hook to access timezone context and formatting utilities.
 */
export function useTimezone() {
  const { mode, toggleMode, effectiveTimezone, churchTimezone } =
    useTimezoneContext();

  /**
   * Formats a date using the currently active timezone (Church or User).
   */
  const format = (date: Date | string | number, formatStr = 'PPpp') => {
    return formatInTZ(date, effectiveTimezone, formatStr);
  };

  return {
    mode,
    toggleMode,
    effectiveTimezone,
    churchTimezone,
    format,
    isChurchTime: mode === 'church',
    isUserTime: mode === 'user',
  };
}
