import { ValidationRuleError } from './validation-rule-error';

/** A serving Usual setup entry names no positive headcount. */
export class UsualSetupEmptyError extends ValidationRuleError {
  readonly reason = 'USUAL_SETUP_EMPTY';

  constructor() {
    super('A serving Usual setup entry needs at least one positive headcount');
  }
}
