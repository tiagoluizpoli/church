import type { AvailabilityStatus } from '../hooks/use-volunteer-pool';

/** Server-side availability status as returned by getScheduleBuilderData. */
export type ServerAvailabilityStatus =
  | 'AVAILABLE'
  | 'UNAVAILABLE'
  | 'DOUBLE_BOOKED'
  | 'PARTIAL'
  | 'NO_RESPONSE';

/**
 * Maps the backend availability status to the UI pool status.
 * DOUBLE_BOOKED is surfaced as a "partial" availability tier in the pool.
 */
export function mapAvailabilityStatus(
  status: ServerAvailabilityStatus | string,
): AvailabilityStatus {
  switch (status) {
    case 'AVAILABLE':
      return 'available';
    case 'UNAVAILABLE':
      return 'unavailable';
    case 'DOUBLE_BOOKED':
      return 'partial';
    case 'PARTIAL':
      return 'partial';
    case 'NO_RESPONSE':
      return 'no_response';
    default:
      return 'no_response';
  }
}
