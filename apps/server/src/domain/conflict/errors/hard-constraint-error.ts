import { DomainError } from '@church/core';
import type { HardConstraintReason } from '../types';

export interface HardConstraintErrorInput {
  reason: HardConstraintReason;
  message: string;
}

export class HardConstraintError extends DomainError {
  readonly code = 'HARD_CONSTRAINT_VIOLATION' as const;
  public readonly reason: HardConstraintReason;

  constructor({ reason, message }: HardConstraintErrorInput) {
    super(message);
    this.reason = reason;
  }
}
