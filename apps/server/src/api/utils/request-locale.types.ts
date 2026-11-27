import type { Locale } from '@church/i18n/runtime';

export interface RequestLocaleInput {
  cookieHeader: string | undefined;
  localeCookieName: string;
  defaultLocale: Locale;
}
