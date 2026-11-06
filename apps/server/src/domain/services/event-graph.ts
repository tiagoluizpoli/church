import { compareInstants, type Instant } from '@church/time';
import type { EventTimeBlockId } from '../branded-ids';
import type { Cycle } from '../entities/cycle';
import { EventGraphRuleError } from '../errors/event-graph-rule';
import { EventOutsideCycleError } from '../errors/event-outside-cycle';
import { LastRemainingEventTimeBlockError } from '../errors/last-remaining-event-time-block-error';

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

interface InstantRange {
  start: Instant;
  end: Instant;
}

function isPositive({ start, end }: InstantRange): boolean {
  return compareInstants({ left: start, right: end }) < 0;
}

/**
 * Final-graph rules shared by create, edit and Send: positive bounds, at least
 * one block, a start day inside the inclusive Cycle (the end may spill past
 * it), and blocks that are contained, labelled and uniquely labelled and
 * identified. Gaps and overlaps between blocks are allowed. Throws the first
 * refusal; checks no persisted state.
 */
export function assertEventGraph({
  graph,
  cycle,
  timeZone,
}: AssertEventGraphInput): void {
  const { start, end, eventTimeBlocks } = graph;

  if (!isPositive({ start, end })) {
    throw new EventGraphRuleError({
      reason: 'INVALID_EVENT_BOUNDS',
      field: 'end',
    });
  }
  if (eventTimeBlocks.length === 0) {
    throw new LastRemainingEventTimeBlockError();
  }
  if (!cycle.containsDate({ instant: start, timeZone })) {
    throw new EventOutsideCycleError();
  }

  const ids = new Set<string>();
  const labels = new Set<string>();

  eventTimeBlocks.forEach((block, index) => {
    const field = `eventTimeBlocks.${index}`;

    if (block.id !== undefined) {
      if (ids.has(block.id)) {
        throw new EventGraphRuleError({
          reason: 'DUPLICATE_EVENT_TIME_BLOCK_ID',
          field: `${field}.id`,
        });
      }
      ids.add(block.id);
    }

    const label = block.label?.trim() ?? '';
    if (label === '') {
      throw new EventGraphRuleError({
        reason: 'EVENT_TIME_BLOCK_LABEL_REQUIRED',
        field: `${field}.label`,
      });
    }
    const labelKey = label.toLowerCase();
    if (labels.has(labelKey)) {
      throw new EventGraphRuleError({
        reason: 'DUPLICATE_EVENT_TIME_BLOCK_LABEL',
        field: `${field}.label`,
      });
    }
    labels.add(labelKey);

    if (!isPositive({ start: block.startTime, end: block.endTime })) {
      throw new EventGraphRuleError({
        reason: 'INVALID_EVENT_BOUNDS',
        field: `${field}.endTime`,
      });
    }
    const contained =
      compareInstants({ left: block.startTime, right: start }) >= 0 &&
      compareInstants({ left: block.endTime, right: end }) <= 0;
    if (!contained) {
      throw new EventGraphRuleError({
        reason: 'EVENT_TIME_BLOCK_OUT_OF_BOUNDS',
        field,
      });
    }
  });
}
