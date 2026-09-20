import { DomainError } from '@church/core';

export class RosterActionNotAvailableError extends DomainError {
  readonly code = 'ROSTER_ACTION_NOT_AVAILABLE';

  constructor() {
    super('Roster action is not available');
  }
}
