import { DomainError } from '@church/core';

/** An Assignment would exceed the people needed for its Shift Requirement. */
export class ShiftRequirementFullError extends DomainError {
  readonly code = 'SHIFT_REQUIREMENT_FULL' as const;

  constructor() {
    super('Assignment would exceed the people needed');
  }
}
