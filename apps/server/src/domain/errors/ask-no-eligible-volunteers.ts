import { ValidationRuleError } from './validation-rule-error';

/** No active Ministry Membership holds a Role the Schedule's Shifts need. */
export class AskNoEligibleVolunteersError extends ValidationRuleError {
  readonly reason = 'ASK_NO_ELIGIBLE_VOLUNTEERS';

  constructor() {
    super('Availability cannot be asked with zero eligible Volunteers');
  }
}
