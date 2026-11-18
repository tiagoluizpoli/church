import { DomainError } from '@church/core';

/** Another active Role of the Ministry already has this name, ignoring case. */
export class RoleNameInUseError extends DomainError {
  readonly code = 'ROLE_NAME_IN_USE' as const;

  constructor() {
    super('An active Role with this name already exists in the Ministry');
  }
}
