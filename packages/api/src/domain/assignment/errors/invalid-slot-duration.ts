import { DomainError } from '@church/core';

export class InvalidSlotDurationError extends DomainError {
  constructor() {
    super('Slot duration must be greater than zero');
  }
}
