import type { Instant } from '@church/time';
import type { EventTimeBlockId } from '../../branded-ids';
import type { Cycle } from '../../entities/cycle';

/** One proposed EventTimeBlock; `id` is present only for a persisted block. */
export interface EventGraphTimeBlock {
  id?: EventTimeBlockId;
  label: string | undefined;
  startTime: Instant;
  endTime: Instant;
}

/** The complete proposed Event and its EventTimeBlocks, as they would be saved. */
export interface EventGraph {
  start: Instant;
  end: Instant;
  eventTimeBlocks: EventGraphTimeBlock[];
}

export interface AssertEventGraphInput {
  graph: EventGraph;
  cycle: Cycle;
  /** The Church Timezone that reads the Event's start CalendarDay. */
  timeZone: string;
}

export interface InstantRange {
  start: Instant;
  end: Instant;
}
