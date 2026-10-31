import type { Locale } from '@church/time';
import type { ChurchRecipient } from '@/domain/contracts/application/church-notifications';

export interface RecipientLocaleInput {
  recipient: ChurchRecipient;
  defaultLocale: Locale;
}

/** The one seam every sink asks for a recipient's language; the configured
 * default until per-person language exists. */
export function recipientLocale({
  defaultLocale,
}: RecipientLocaleInput): Locale {
  return defaultLocale;
}
