import { DomainError } from '@church/core';

/** Another active Sector of the Ministry already has this name, ignoring case. */
export class SectorNameInUseError extends DomainError {
  readonly code = 'SECTOR_NAME_IN_USE' as const;

  constructor() {
    super('An active Sector with this name already exists in the Ministry');
  }
}
