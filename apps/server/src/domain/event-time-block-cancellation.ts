import type { EventStatus } from './entities/event';
import type { EventTimeBlockStatus } from './entities/event-time-block';
import {
  EventCancelledError,
  EventTimeBlockCancelledError,
} from './errors/event-cancelled';
import type { ShiftCancellation } from './services/assignment-eligibility';

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
