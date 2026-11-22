import { compareInstants, type Instant } from '@church/time';

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

/**
 * The path a rescheduled block shows. The as-sent time is the first move's
 * previous value, or the current time when nothing was recorded.
 */
export function eventTimeBlockMovePath({
  currentStart,
  currentEnd,
  moves,
}: EventTimeBlockMovePathInput): EventTimeBlockMovePath {
  const [first] = moves;
  const asSent = first
    ? { start: first.previousStart, end: first.previousEnd }
    : { start: currentStart, end: currentEnd };
  const steps = [
    asSent,
    ...moves.map(({ newStart, newEnd }) => ({ start: newStart, end: newEnd })),
  ];
  const moved =
    compareInstants({ left: asSent.start, right: currentStart }) !== 0 ||
    compareInstants({ left: asSent.end, right: currentEnd }) !== 0;
  return { moved, steps };
}
