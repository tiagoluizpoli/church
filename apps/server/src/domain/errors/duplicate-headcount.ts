import { ValidationRuleError } from './validation-rule-error';

/** One UsualSetup entry names the same Sector and Role twice. */
export class DuplicateHeadcountError extends ValidationRuleError {
  readonly reason = 'DUPLICATE_HEADCOUNT';

  constructor() {
    super('A Usual setup entry names the same Sector and Role twice');
  }
}
