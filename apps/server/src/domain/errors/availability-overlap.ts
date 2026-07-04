import { DomainError } from '@church/core';

export class AvailabilityOverlapError extends DomainError {
  readonly code = 'AVAILABILITY_OVERLAP';

  constructor() {
    super(
      'Confirming would leave you available for overlapping shifts in different ministries',
    );
  }
}
