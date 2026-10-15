import { DomainError } from '@church/core';

export class LastRemainingEventTimeBlockError extends DomainError {
  readonly code = 'LAST_REMAINING_EVENT_TIME_BLOCK' as const;

  constructor() {
    super(
      'Cannot delete the only remaining slot for a day; delete the day instead',
    );
  }
}
