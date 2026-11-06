import { DomainError } from '@church/core';
import type { Event } from '../entities/event';
import type { OutsideEventReference } from './event-outside-cycle';

export interface InvalidCycleEventsErrorInput {
  /** Every Event of the Cycle whose saved graph breaks a final-graph rule. */
  invalidEvents: Event[];
}

/**
 * Send refuses a Draft holding legacy Events that the shared final-graph rules
 * reject, naming each so the ChurchAdmin can repair it before sending.
 */
export class InvalidCycleEventsError extends DomainError {
  readonly code = 'INVALID_CYCLE_EVENTS' as const;
  readonly invalidEvents: OutsideEventReference[];

  constructor({ invalidEvents }: InvalidCycleEventsErrorInput) {
    super('Some Events of the Cycle must be repaired before it can be sent');
    this.invalidEvents = invalidEvents.map((invalid) => ({
      id: invalid.id,
      title: invalid.title,
      start: invalid.start,
      end: invalid.end,
    }));
  }
}
