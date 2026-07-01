import { areIntervalsOverlapping } from 'date-fns';

export interface TimeInterval {
  start: Date;
  end: Date;
}

/**
 * Service to handle volunteer availability logic.
 * Enforces absolute UTC comparisons to ensure DST immunity.
 */
export const AvailabilityService = {
  /**
   * Checks if a given time slot overlaps with any unavailable periods.
   * Both inputs must use absolute Date objects.
   *
   * @param slot - The time interval to check (e.g., an event time slot)
   * @param unavailabilities - Array of intervals where the volunteer is marked as unavailable
   * @returns true if there is an overlap, false otherwise
   */
  isUnavailable(slot: TimeInterval, unavailabilities: TimeInterval[]): boolean {
    return unavailabilities.some((unavailable) =>
      areIntervalsOverlapping(
        { start: slot.start, end: slot.end },
        { start: unavailable.start, end: unavailable.end },
      ),
    );
  },

  /**
   * Checks if a given time slot is fully covered by available periods.
   * (Helper for positive availability matching)
   */
  isAvailable(slot: TimeInterval, availabilities: TimeInterval[]): boolean {
    // Basic implementation: check if ANY availability interval covers the slot
    // In a more complex scenario, this might need to merge contiguous intervals
    return availabilities.some(
      (available) => available.start <= slot.start && available.end >= slot.end,
    );
  },
};
