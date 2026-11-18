import { DomainError } from '@church/core';

/**
 * Covers a nonexistent Ministry, a Ministry outside the Active Church, and a
 * Ministry the caller has no authority to manage — deliberately one error,
 * one fixed message, so the three cases are byte-identical on the wire and
 * nobody can map another congregation's structure by probing.
 */
export class MinistryInvitationNotFoundError extends DomainError {
  readonly code = 'MINISTRY_NOT_FOUND' as const;

  constructor() {
    super('Ministry not found');
  }
}
