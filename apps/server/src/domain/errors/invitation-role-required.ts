import { ValidationRuleError } from './validation-rule-error';

/** A volunteer-level Ministry offer names no Role; a leader may have none. */
export class InvitationRoleRequiredError extends ValidationRuleError {
  readonly reason = 'INVITATION_ROLE_REQUIRED';

  constructor() {
    super('A volunteer-level Ministry Invitation needs at least one Role');
  }
}
