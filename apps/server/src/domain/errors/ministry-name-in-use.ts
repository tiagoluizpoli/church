import { DomainError } from '@church/core';

/** Another active Ministry of the Church already has this name, ignoring case. */
export class MinistryNameInUseError extends DomainError {
  readonly code = 'MINISTRY_NAME_IN_USE' as const;

  constructor() {
    super('An active Ministry with this name already exists');
  }
}
