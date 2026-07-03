import { DomainError } from '@church/core';

export class ShiftOutOfBoundsError extends DomainError {
  readonly code = 'SHIFT_OUT_OF_BOUNDS' as const;

  constructor() {
    super('Shift must be within its time slot bounds');
  }
}
