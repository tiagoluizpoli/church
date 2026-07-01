import { DomainError } from '@church/core';

export class InvalidSlotDurationError extends DomainError {
  readonly code = 'INVALID_SLOT_DURATION' as const;

  constructor() {
    super('Slot duration must be greater than zero');
  }
}
