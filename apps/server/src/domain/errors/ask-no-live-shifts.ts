import { ValidationRuleError } from './validation-rule-error';

/** The Schedule serves no live Shift in the Cycle, so there is nothing to ask about. */
export class AskNoLiveShiftsError extends ValidationRuleError {
  readonly reason = 'ASK_NO_LIVE_SHIFTS';

  constructor() {
    super('Availability cannot be asked with no live Shifts');
  }
}
