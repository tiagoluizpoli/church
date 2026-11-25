import type { EventStatus } from './entities/event';
import type { EventTimeBlockStatus } from './entities/event-time-block';
import {
  EventCancelledError,
  EventTimeBlockCancelledError,
} from './errors/event-cancelled';

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

/** Refuses a write into a cancelled block, naming which of the two was cancelled. */
export function assertEventTimeBlockNotCancelled({
  event,
  eventTimeBlock,
}: EventTimeBlockCancellationInput): void {
  if (event.status === 'cancelled') throw new EventCancelledError();
  if (eventTimeBlock.status === 'cancelled')
    throw new EventTimeBlockCancelledError();
}
