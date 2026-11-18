import { ValidationRuleError } from './validation-rule-error';

/** The typed confirmation is not the locale's fixed cancellation word. */
export class CancelConfirmationMismatchError extends ValidationRuleError {
  readonly reason = 'CANCEL_CONFIRMATION';

  constructor() {
    super('The typed confirmation does not match the cancellation word');
  }
}
