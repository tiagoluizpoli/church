import { DomainError } from '@church/core';

export class InvalidShiftSplitError extends DomainError {
  readonly code = 'INVALID_SHIFT_SPLIT' as const;

  constructor(reason: string) {
    super(`Invalid shift split: ${reason}`);
  }
}
