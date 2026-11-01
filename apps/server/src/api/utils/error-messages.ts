import type { DomainError } from '@church/core';
import { m } from '@church/i18n/messages';
import type { Locale } from '@church/i18n/runtime';
import { type ErrorMessage, errorMessage } from './error-table';
import {
  type ValidationReason,
  ValidationRuleError,
} from '@/domain/errors/validation-rule-error';

export const VALIDATION_REASON_MESSAGES: Record<
  ValidationReason,
  ErrorMessage
> = {
  DUPLICATE_HEADCOUNT: m.error_validation_duplicate_headcount,
  DUPLICATE_TEMPLATE_NAME: m.error_validation_duplicate_template_name,
  DUPLICATE_TEMPLATE_BLOCK_LABEL:
    m.error_validation_duplicate_template_block_label,
};

interface DomainErrorMessageInput {
  error: DomainError;
  locale: Locale;
}

/** The rule-based reason a `VALIDATION_ERROR` carries, also sent to the client. */
export function validationReason(
  error: DomainError,
): ValidationReason | undefined {
  return error instanceof ValidationRuleError ? error.reason : undefined;
}

/** The catalog text for a domain error, or undefined when its code has no entry. */
export function domainErrorMessage({
  error,
  locale,
}: DomainErrorMessageInput): string | undefined {
  const reason = validationReason(error);
  if (error.code === 'VALIDATION_ERROR' && reason) {
    return VALIDATION_REASON_MESSAGES[reason]({}, { locale });
  }
  return errorMessage({ code: error.code, locale });
}
