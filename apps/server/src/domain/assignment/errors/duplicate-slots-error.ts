import { DomainError } from '@church/core';

export class DuplicateSlotsError extends DomainError {
  readonly code = 'DUPLICATE_SLOTS' as const;

  constructor() {
    super('Event already has existing slots. Delete them before regenerating.');
  }
}
