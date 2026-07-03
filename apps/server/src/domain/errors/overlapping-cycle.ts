import { DomainError } from '@church/core';

export class OverlappingCycleError extends DomainError {
  readonly code = 'OVERLAPPING_CYCLE' as const;

  constructor() {
    super('Planning cycle overlaps an existing cycle');
  }
}
