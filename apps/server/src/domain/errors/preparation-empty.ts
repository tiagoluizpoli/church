import { ValidationRuleError } from './validation-rule-error';

/** A serving save of an already-served block names no positive headcount. */
export class PreparationEmptyError extends ValidationRuleError {
  readonly reason = 'PREPARATION_EMPTY';

  constructor() {
    super('A serving preparation needs at least one positive headcount');
  }
}
