import { DomainError } from '@church/core';

export class LastRemainingSlotError extends DomainError {
  readonly code = 'LAST_REMAINING_SLOT' as const;

  constructor() {
    super(
      'Cannot delete the only remaining slot for a day; delete the day instead',
    );
  }
}
