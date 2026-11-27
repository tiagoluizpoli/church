import type { EventStatus } from './entities/event';
import type { EventTimeBlockStatus } from './entities/event-time-block';
import {
  EventCancelledError,
  EventTimeBlockCancelledError,
} from './errors/event-cancelled';
import type { ShiftCancellation } from './services/scheduling/assignment-eligibility.types';

interface EventTimeBlockCancellationInput {
  event: { status: EventStatus };
  eventTimeBlock: { status: EventTimeBlockStatus };
}

/** Cancelling an Event leaves its blocks active, so a block is cancelled by either. */
export function isEventTimeBlockCancelled({
  event,
  eventTimeBlock,
}: EventTimeBlockCancellationInput): boolean {
  return event.status === 'cancelled' || eventTimeBlock.status === 'cancelled';
}

interface EventTimeBlockHiddenInput {
  event: { isHidden: boolean };
  eventTimeBlock: { isHidden: boolean };
}

/**
 * The one answer to "is this cancelled block hidden": an Event's choice covers
 * all its blocks. Hidden is only ever set on something cancelled. The query
 * twin is `shownEventTimeBlock` (infrastructure live-event-time-block.ts).
 */
export function isEventTimeBlockHidden({
  event,
  eventTimeBlock,
}: EventTimeBlockHiddenInput): boolean {
  return event.isHidden || eventTimeBlock.isHidden;
}

/** Which of the two cancelled the block, the Event first; null when neither. */
export function eventTimeBlockCancellation({
  event,
  eventTimeBlock,
}: EventTimeBlockCancellationInput): ShiftCancellation | null {
  if (event.status === 'cancelled') return 'event';
  if (eventTimeBlock.status === 'cancelled') return 'event_time_block';
  return null;
}

/** Refuses a write into a cancelled block, naming which of the two was cancelled. */
export function assertEventTimeBlockNotCancelled(
  input: EventTimeBlockCancellationInput,
): void {
  const cancelledBy = eventTimeBlockCancellation(input);
  if (cancelledBy === 'event') throw new EventCancelledError();
  if (cancelledBy === 'event_time_block')
    throw new EventTimeBlockCancelledError();
}
