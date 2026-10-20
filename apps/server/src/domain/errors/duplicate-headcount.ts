import { DomainError } from '@church/core';

/** Rule-based reasons a `VALIDATION_ERROR` can carry; the HTTP layer words each one. */
export const VALIDATION_REASONS = ['DUPLICATE_HEADCOUNT'] as const;
export type ValidationReason = (typeof VALIDATION_REASONS)[number];

/** One UsualSetup entry names the same Sector and Role twice. */
export class DuplicateHeadcountError extends DomainError {
  readonly code = 'VALIDATION_ERROR' as const;
  readonly reason: ValidationReason = 'DUPLICATE_HEADCOUNT';

  constructor() {
    super('A Usual setup entry names the same Sector and Role twice');
  }
}
