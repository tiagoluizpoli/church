import { DomainError } from '@church/core';

export class DuplicateSlotsError extends DomainError {
  constructor() {
    super('Event already has existing slots. Delete them before regenerating.');
  }
}
