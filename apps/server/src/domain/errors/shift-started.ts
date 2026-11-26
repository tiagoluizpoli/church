import { DomainError } from '@church/core';

/** An Assignment change on a Shift that has started; it is fixed from then on. */
export class ShiftStartedError extends DomainError {
  readonly code = 'SHIFT_STARTED' as const;
  constructor() {
    super('Shift has started');
  }
}
