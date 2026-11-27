import type { Locale } from '@church/time';
import type { ChurchRecipient } from '@/domain/contracts/application/church-notifications';
import type { AddressRecipient } from '@/domain/contracts/infrastructure/email-sender';

export interface RecipientLocaleInput {
  recipient: ChurchRecipient | AddressRecipient;
  defaultLocale: Locale;
}
