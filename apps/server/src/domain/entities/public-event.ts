import type { Instant } from '@church/time';
import type { EventTimeBlockMovePath } from '../services/event-time-block-move-path';

/** One public EventTimeBlock as visitors see it. */
export interface PublicEventBlock {
  label: string | null;
  start: Instant;
  end: Instant;
  place: string | null;
  cancelled: boolean;
  movePath: EventTimeBlockMovePath;
}

/** An Event of a sent Cycle with at least one public block, showing only those. */
export interface PublicEvent {
  eventId: string;
  title: string;
  cancelled: boolean;
  /** Earliest public block start; the ordering key. */
  start: Instant;
  blocks: PublicEventBlock[];
}

/** Keyset position: the last item of the previous page. */
export interface PublicEventCursor {
  start: Instant;
  eventId: string;
}

export interface PublicEventPage {
  items: PublicEvent[];
  nextCursor: PublicEventCursor | null;
}
