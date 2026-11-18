import { isLocale, type Locale } from '@church/i18n/runtime';

interface RequestLocaleInput {
  cookieHeader: string | undefined;
  localeCookieName: string;
  defaultLocale: Locale;
}

/** The locale cookie's valid value, else the default locale. */
export function requestLocale({
  cookieHeader,
  localeCookieName,
  defaultLocale,
}: RequestLocaleInput): Locale {
  for (const part of (cookieHeader ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    const value = rest.join('=');
    if (name === localeCookieName && isLocale(value)) return value;
  }
  return defaultLocale;
}
