import { DomainError } from '@church/core';

/** Público or place of an EventTimeBlock that has started cannot change. */
export class PublicInfoLockedError extends DomainError {
  readonly code = 'PUBLIC_INFO_LOCKED' as const;

  constructor() {
    super('Público and place cannot change once the time block has started');
  }
}
