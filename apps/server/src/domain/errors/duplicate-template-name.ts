import { DomainError } from '@church/core';
import type { ValidationReason } from './duplicate-headcount';

/** Another EventTemplate of the Church already has this name, ignoring case. */
export class DuplicateTemplateNameError extends DomainError {
  readonly code = 'VALIDATION_ERROR' as const;
  readonly reason: ValidationReason = 'DUPLICATE_TEMPLATE_NAME';

  constructor() {
    super('An Event template with this name already exists');
  }
}

/** Two TemplateTimeBlocks of one desired template share a label, ignoring case. */
export class DuplicateTemplateBlockLabelError extends DomainError {
  readonly code = 'VALIDATION_ERROR' as const;
  readonly reason: ValidationReason = 'DUPLICATE_TEMPLATE_BLOCK_LABEL';

  constructor() {
    super('Two blocks of an Event template share a label');
  }
}
