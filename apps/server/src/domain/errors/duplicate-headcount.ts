import { ValidationRuleError } from './validation-rule-error';

/** One Shift's headcounts name the same Sector and Role twice. */
export class DuplicateHeadcountError extends ValidationRuleError {
  readonly reason = 'DUPLICATE_HEADCOUNT';

  constructor() {
    super('A headcount list names the same Shift, Sector and Role twice');
  }
}
