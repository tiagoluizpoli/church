import { DomainError } from '@church/core';

export class CheckAccessDeniedError extends DomainError {
  readonly code = 'CHECK_ACCESS_DENIED';

  constructor() {
    super('This availability check belongs to another volunteer');
  }
}
