import { compareInstants } from '@church/time';
import type {
  AvailabilityCheckRequest,
  AvailabilityResult,
  TimeRange,
} from './types';

interface RangesIntersectInput {
  left: TimeRange;
  right: TimeRange;
}

function rangesIntersect({ left, right }: RangesIntersectInput): boolean {
  return (
    compareInstants({ left: left.start, right: right.end }) < 0 &&
    compareInstants({ left: right.start, right: left.end }) < 0
  );
}

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
    // 1. Check Blockouts (UNAVAILABLE)
    for (const blockout of request.existingBlockouts) {
      if (blockout.churchId !== request.churchId) {
        throw new Error(
          `Isolation breach: blockout ${blockout.id} belongs to a different church.`,
        );
      }

      if (
        rangesIntersect({ left: request.timeRange, right: blockout.timeRange })
      ) {
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

      if (
        rangesIntersect({
          left: request.timeRange,
          right: assignment.timeRange,
        })
      ) {
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
