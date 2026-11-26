import { event, eventTimeBlock } from '@church/db';
import { and, eq, ne, type SQL } from 'drizzle-orm';

/**
 * The one query condition for an EventTimeBlock that can still be served:
 * neither its Event nor the block itself is cancelled. Cancelling an Event
 * leaves its blocks active, so both are checked. The query joins `event` and
 * `event_time_block` under their own names. The in-memory twin is
 * `isEventTimeBlockCancelled` (domain/event-time-block-cancellation.ts).
 */
export function liveEventTimeBlock(): SQL {
  return and(
    ne(event.status, 'cancelled'),
    eq(eventTimeBlock.status, 'active'),
  ) as SQL;
}
