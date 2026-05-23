import { DomainError } from '@church/core';

export class InvalidRequiredCountError extends DomainError {
  constructor() {
    super('Required count must be at least 1');
  }
}
