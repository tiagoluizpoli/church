import { ArchiveBlockedError, type ArchiveBlocker } from './archive-blocked';

export interface RoleInUseErrorInput {
  blockers: ArchiveBlocker[];
}

/** The Role still staffs upcoming requirements or a retained UsualSetup. */
export class RoleInUseError extends ArchiveBlockedError {
  readonly code = 'ROLE_IN_USE' as const;

  constructor({ blockers }: RoleInUseErrorInput) {
    super({ message: 'The Role is still used by current planning', blockers });
  }
}
