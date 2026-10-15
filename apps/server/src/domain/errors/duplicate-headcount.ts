import { DomainError } from '@church/core';

/** One UsualSetup entry names the same Sector and Role twice. */
export class DuplicateHeadcountError extends DomainError {
  readonly code = 'VALIDATION_ERROR' as const;

  constructor() {
    super('A Usual setup entry names the same Sector and Role twice');
  }
}
