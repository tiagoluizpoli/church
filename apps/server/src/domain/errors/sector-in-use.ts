import { DomainError } from '@church/core';
import type { ArchiveBlocker } from '../archive-blockers';

export interface SectorInUseErrorInput {
  blockers: ArchiveBlocker[];
}

/** Upcoming ShiftRequirements or a UsualSetup headcount still use the Sector. */
export class SectorInUseError extends DomainError {
  readonly code = 'SECTOR_IN_USE' as const;
  readonly blockers: ArchiveBlocker[];

  constructor({ blockers }: SectorInUseErrorInput) {
    super('The Sector is still used by upcoming planning or a UsualSetup');
    this.blockers = blockers;
  }
}
