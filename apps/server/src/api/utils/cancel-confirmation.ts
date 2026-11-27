import { m } from '@church/i18n/messages';
import { CancelConfirmationMismatchError } from '../../domain/errors/cancel-confirmation-mismatch';
import type { AssertCancelConfirmationInput } from './cancel-confirmation.types';

/** The typed gate: the locale's fixed word, trimmed, any letter case; nothing else. */
export function assertCancelConfirmation({
  confirmation,
  locale,
}: AssertCancelConfirmationInput): void {
  const word = m.cancellation_confirm_word({}, { locale });
  if (confirmation.trim().toLowerCase() !== word.toLowerCase()) {
    throw new CancelConfirmationMismatchError();
  }
}
