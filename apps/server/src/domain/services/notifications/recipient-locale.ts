import type { Locale } from '@church/time';
import type { RecipientLocaleInput } from './recipient-locale.types';

/** The one seam every sink and Transactional sender asks for a recipient's
 * language; the configured default until per-person language exists. */
export function recipientLocale({
  defaultLocale,
}: RecipientLocaleInput): Locale {
  return defaultLocale;
}
