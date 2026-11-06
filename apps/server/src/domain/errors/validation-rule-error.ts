import { DomainError } from '@church/core';

/** Rule-based reasons a `VALIDATION_ERROR` can carry; the HTTP layer words each one. */
export const VALIDATION_REASONS = [
  'DUPLICATE_HEADCOUNT',
  'DUPLICATE_TEMPLATE_NAME',
  'DUPLICATE_TEMPLATE_BLOCK_LABEL',
  'USUAL_SETUP_EMPTY',
  'INVALID_SHIFT_INDEX',
  'INVITATION_ROLE_REQUIRED',
  'INVALID_EVENT_BOUNDS',
  'EVENT_TIME_BLOCK_OUT_OF_BOUNDS',
  'EVENT_TIME_BLOCK_LABEL_REQUIRED',
  'DUPLICATE_EVENT_TIME_BLOCK_LABEL',
  'DUPLICATE_EVENT_TIME_BLOCK_ID',
] as const;
export type ValidationReason = (typeof VALIDATION_REASONS)[number];

/** A `VALIDATION_ERROR` refused by a named domain rule, sent to the client as its `reason`. */
export abstract class ValidationRuleError extends DomainError {
  readonly code = 'VALIDATION_ERROR' as const;
  abstract readonly reason: ValidationReason;
}
