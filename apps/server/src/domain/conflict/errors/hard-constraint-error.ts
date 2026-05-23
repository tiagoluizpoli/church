import { DomainError } from '@church/core';
import type { HardConstraintReason } from '../types';

export class HardConstraintError extends DomainError {
  public readonly reason: HardConstraintReason;

  constructor(reason: HardConstraintReason, message: string) {
    super(message);
    this.reason = reason;
  }
}
