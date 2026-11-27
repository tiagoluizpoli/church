import type { DomainError } from '@church/core';
import type { Locale } from '@church/i18n/runtime';

export interface DomainErrorMessageInput {
  error: DomainError;
  locale: Locale;
}
