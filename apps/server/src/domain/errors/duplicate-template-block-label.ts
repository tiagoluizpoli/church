import { ValidationRuleError } from './validation-rule-error';

/** Two TemplateTimeBlocks of one template share a label, ignoring case. */
export class DuplicateTemplateBlockLabelError extends ValidationRuleError {
  readonly reason = 'DUPLICATE_TEMPLATE_BLOCK_LABEL';

  constructor() {
    super('Two blocks of an Event template share a label');
  }
}
