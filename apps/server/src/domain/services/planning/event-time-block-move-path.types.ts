import type { Instant } from '@church/time';

export interface EventTimeBlockMove {
  previousStart: Instant;
  previousEnd: Instant;
  newStart: Instant;
  newEnd: Instant;
}

export interface EventTimeBlockMovePathInput {
  currentStart: Instant;
  currentEnd: Instant;
  /** Recorded moves, oldest first. */
  moves: EventTimeBlockMove[];
}

export interface EventTimeBlockMoveStep {
  start: Instant;
  end: Instant;
}

export interface EventTimeBlockMovePath {
  /** False when there is nothing to mark: no moves, or back at the as-sent time. */
  moved: boolean;
  /** As-sent time first, then each later time; the last is the current time. */
  steps: EventTimeBlockMoveStep[];
}
