import { DomainError } from '@church/core';

export class ChurchSlugTakenError extends DomainError {
  readonly code = 'CHURCH_SLUG_TAKEN' as const;

  constructor(slug: string) {
    super(`Church slug "${slug}" is already taken.`);
  }
}
