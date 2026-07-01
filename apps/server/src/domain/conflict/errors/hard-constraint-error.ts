import { DomainError } from '@church/core';
import type { HardConstraintReason } from '../types';

export class HardConstraintError extends DomainError {
  readonly code = 'HARD_CONSTRAINT_VIOLATION' as const;
  public readonly reason: HardConstraintReason;

  constructor(reason: HardConstraintReason, message: string) {
    super(message);
    this.reason = reason;
  }
}
