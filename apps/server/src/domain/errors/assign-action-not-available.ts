import { DomainError } from '@church/core';

export class AssignActionNotAvailableError extends DomainError {
  readonly code = 'ASSIGN_ACTION_NOT_AVAILABLE';

  constructor() {
    super('Schedule action is not available');
  }
}
