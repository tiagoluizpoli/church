import { DomainError } from '@church/core';
import type { ArchiveBlocker } from '../archive-blockers';

export interface RoleInUseErrorInput {
  blockers: ArchiveBlocker[];
}

/** Upcoming ShiftRequirements or a UsualSetup headcount still use the Role. */
export class RoleInUseError extends DomainError {
  readonly code = 'ROLE_IN_USE' as const;
  readonly blockers: ArchiveBlocker[];

  constructor({ blockers }: RoleInUseErrorInput) {
    super('The Role is still used by upcoming planning or a UsualSetup');
    this.blockers = blockers;
  }
}
