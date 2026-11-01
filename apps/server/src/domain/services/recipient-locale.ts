import type { Locale } from '@church/time';
import type { ChurchRecipient } from '@/domain/contracts/application/church-notifications';

/** A Transactional recipient known only by address (no Church Membership). */
export interface AddressRecipient {
  email: string;
}

export interface RecipientLocaleInput {
  recipient: ChurchRecipient | AddressRecipient;
  defaultLocale: Locale;
}

/** The one seam every sink and Transactional sender asks for a recipient's
 * language; the configured default until per-person language exists. */
export function recipientLocale({
  defaultLocale,
}: RecipientLocaleInput): Locale {
  return defaultLocale;
}
