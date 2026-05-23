import { DomainError } from '@church/core';

export class EmptyScheduleError extends DomainError {
  constructor() {
    super('Cannot publish an event with no assignments');
  }
}
