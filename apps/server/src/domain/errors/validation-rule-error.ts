import { DomainError } from '@church/core';

/** Rule-based reasons a `VALIDATION_ERROR` can carry; the HTTP layer words each one. */
export const VALIDATION_REASONS = [
  'DUPLICATE_HEADCOUNT',
  'DUPLICATE_TEMPLATE_NAME',
  'DUPLICATE_TEMPLATE_BLOCK_LABEL',
] as const;
export type ValidationReason = (typeof VALIDATION_REASONS)[number];

/** A `VALIDATION_ERROR` refused by a named domain rule, sent to the client as its `reason`. */
export abstract class ValidationRuleError extends DomainError {
  readonly code = 'VALIDATION_ERROR' as const;
  abstract readonly reason: ValidationReason;
}
