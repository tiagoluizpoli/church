import { useTimezoneContext } from '../components/timezone-provider';

/**
 * Hook to access the Church Timezone.
 */
export function useTimezone() {
  const { churchTimezone } = useTimezoneContext();

  return {
    churchTimezone,
  };
}
