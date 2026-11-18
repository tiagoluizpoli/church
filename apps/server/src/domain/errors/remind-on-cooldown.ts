import { DomainError } from '@church/core';
import type { Instant } from '@church/time';

export interface RemindOnCooldownErrorInput {
  remindAvailableAt: Instant;
}

export class RemindOnCooldownError extends DomainError {
  readonly code = 'REMIND_ON_COOLDOWN' as const;
  readonly remindAvailableAt: Instant;

  constructor({ remindAvailableAt }: RemindOnCooldownErrorInput) {
    super('This Schedule was reminded too recently');
    this.remindAvailableAt = remindAvailableAt;
  }
}
