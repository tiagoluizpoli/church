import { DomainError } from '@church/core';

export class InvalidOverrideReasonError extends DomainError {
  constructor() {
    super('Override reason must be a non-empty string');
  }
}
