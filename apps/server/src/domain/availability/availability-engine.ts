import type { AvailabilityCheckRequest, AvailabilityResult } from './types';

/**
 * Pure Domain Service for availability calculations.
 * Adheres strictly to Spec L1 and mathematical interval overlap logic.
 */
export const AvailabilityEngine = {
  /**
   * Evaluates if a volunteer is available for the requested time range.
   *
   * @throws Error if a churchId isolation breach is detected.
   */
  checkAvailability(request: AvailabilityCheckRequest): AvailabilityResult {
    const { start, end } = request.timeRange;
    const requestStart = start.getTime();
    const requestEnd = end.getTime();

    // 1. Check Blockouts (UNAVAILABLE)
    for (const blockout of request.existingBlockouts) {
      if (blockout.churchId !== request.churchId) {
        throw new Error(
          `Isolation breach: blockout ${blockout.id} belongs to a different church.`,
        );
      }

      const bStart = blockout.timeRange.start.getTime();
      const bEnd = blockout.timeRange.end.getTime();

      // Math.max(start1, start2) < Math.min(end1, end2)
      if (Math.max(requestStart, bStart) < Math.min(requestEnd, bEnd)) {
        return {
          status: 'UNAVAILABLE',
          conflictReason: 'blockout',
          conflictingId: blockout.id,
        };
      }
    }

    // 2. Check Assignments (DOUBLE_BOOKED)
    for (const assignment of request.existingAssignments) {
      if (assignment.churchId !== request.churchId) {
        throw new Error(
          `Isolation breach: assignment ${assignment.id} belongs to a different church.`,
        );
      }

      // Skip if this is the assignment we are currently editing
      if (
        request.excludeAssignmentId &&
        assignment.id === request.excludeAssignmentId
      ) {
        continue;
      }

      // Skip declined assignments
      if (assignment.status === 'declined') {
        continue;
      }

      const aStart = assignment.timeRange.start.getTime();
      const aEnd = assignment.timeRange.end.getTime();

      if (Math.max(requestStart, aStart) < Math.min(requestEnd, aEnd)) {
        return {
          status: 'DOUBLE_BOOKED',
          conflictReason: 'assignment',
          conflictingId: assignment.id,
        };
      }
    }

    // 3. No conflicts found
    return {
      status: 'AVAILABLE',
    };
  },
};
