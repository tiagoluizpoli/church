import { DomainError } from '@church/core';
import type { EventTimeBlockId } from '../branded-ids';

export interface StaffedEventTimeBlockDropErrorInput {
  eventTimeBlockId: EventTimeBlockId;
}

/** An edit left out a block with active Assignments; removing it is a cancel. */
export class StaffedEventTimeBlockDropError extends DomainError {
  readonly code = 'STAFFED_EVENT_TIME_BLOCK_DROP' as const;
  readonly eventTimeBlockId: EventTimeBlockId;

  constructor({ eventTimeBlockId }: StaffedEventTimeBlockDropErrorInput) {
    super(
      `EventTimeBlock ${eventTimeBlockId} has active Assignments; cancel it instead of dropping it`,
    );
    this.eventTimeBlockId = eventTimeBlockId;
  }
}
