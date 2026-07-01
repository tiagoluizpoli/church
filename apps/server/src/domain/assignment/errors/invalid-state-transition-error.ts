import { DomainError } from '@church/core';

export class InvalidStateTransitionError extends DomainError {
  readonly code = 'INVALID_STATE_TRANSITION' as const;
  public readonly currentStatus: string;
  public readonly attemptedAction: string;
  constructor(currentStatus: string, attemptedAction: string) {
    super(`Cannot ${attemptedAction}: event is in '${currentStatus}' status`);
    this.currentStatus = currentStatus;
    this.attemptedAction = attemptedAction;
  }
}
