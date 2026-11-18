import { DomainError } from '@church/core';
import type { Instant } from '@church/time';
import type { EventId } from '../branded-ids';
import type { Event } from '../entities/event';

/** An owned Event whose Church-local start day a Cycle edit would exclude. */
export interface OutsideEventReference {
  id: EventId;
  title: string;
  start: Instant;
  end: Instant;
}

export interface EventOutsideCycleErrorInput {
  /** Every Event a range edit would exclude; absent for a single Event write. */
  outsideEvents?: Event[];
}

export class EventOutsideCycleError extends DomainError {
  readonly code = 'EVENT_OUTSIDE_CYCLE' as const;
  readonly outsideEvents: OutsideEventReference[] | undefined;

  constructor({ outsideEvents }: EventOutsideCycleErrorInput = {}) {
    super('Event start date must fall within the cycle');
    this.outsideEvents = outsideEvents?.map((outside) => ({
      id: outside.id,
      title: outside.title,
      start: outside.start,
      end: outside.end,
    }));
  }
}
