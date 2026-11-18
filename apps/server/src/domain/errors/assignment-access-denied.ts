import { DomainError } from '@church/core';

export class AssignmentAccessDeniedError extends DomainError {
  readonly code = 'ASSIGNMENT_ACCESS_DENIED';

  constructor() {
    super('This assignment belongs to another volunteer');
  }
}
