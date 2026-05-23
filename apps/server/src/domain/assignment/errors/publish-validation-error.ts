import { DomainError } from '@church/core';
import type { HardConstraintFailure } from '../types';

export class PublishValidationError extends DomainError {
  public readonly failures: HardConstraintFailure[];
  constructor(failures: HardConstraintFailure[]) {
    super(
      `Cannot publish: ${failures.length} assignment(s) fail hard constraints`,
    );
    this.failures = failures;
  }
}
