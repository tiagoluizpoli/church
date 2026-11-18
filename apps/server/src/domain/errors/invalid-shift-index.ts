import { ValidationRuleError } from './validation-rule-error';

/** A Usual setup headcount names a Shift its split does not generate. */
export class InvalidShiftIndexError extends ValidationRuleError {
  readonly reason = 'INVALID_SHIFT_INDEX';

  constructor() {
    super('A Usual setup headcount names a Shift outside its split');
  }
}
