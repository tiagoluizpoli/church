import { ValidationRuleError } from './validation-rule-error';

/** Another EventTemplate of the Church already has this name, ignoring case. */
export class DuplicateTemplateNameError extends ValidationRuleError {
  readonly reason = 'DUPLICATE_TEMPLATE_NAME';

  constructor() {
    super('An Event template with this name already exists');
  }
}
