import { DomainError } from '@church/core';
import type { Instant } from '@church/time';
import type { EventTimeBlockId } from '../branded-ids';

/** A block with a served Shift that names no ShiftRequirement. */
export interface FlaggedBlock {
  eventTimeBlockId: EventTimeBlockId;
  startsAt: Instant;
}

export interface AskBlockedFlaggedShiftsErrorInput {
  flaggedBlocks: FlaggedBlock[];
}

export class AskBlockedFlaggedShiftsError extends DomainError {
  readonly code = 'ASK_BLOCKED_FLAGGED_SHIFTS' as const;
  readonly flaggedBlocks: FlaggedBlock[];

  constructor({ flaggedBlocks }: AskBlockedFlaggedShiftsErrorInput) {
    super('Availability cannot be asked while a served Shift is flagged');
    this.flaggedBlocks = flaggedBlocks;
  }
}
