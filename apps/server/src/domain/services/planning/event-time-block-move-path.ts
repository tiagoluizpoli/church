import { compareInstants } from '@church/time';
import type {
  EventTimeBlockMovePath,
  EventTimeBlockMovePathInput,
} from './event-time-block-move-path.types';

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
