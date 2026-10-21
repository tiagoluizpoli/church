import { appConfig } from '@church/app-config';
import { isLocale, type Locale } from '@church/i18n/runtime';

interface RequestLocaleInput {
  headers: { cookie?: string };
}

interface RecipientLocaleInput {
  recipient: { userId: string };
}

/** The locale cookie's valid value, else the default locale. */
export function requestLocale({ headers }: RequestLocaleInput): Locale {
  for (const part of (headers.cookie ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    const value = rest.join('=');
    if (name === appConfig.localeCookieName && isLocale(value)) return value;
  }
  return appConfig.defaultLocale;
}

/** The one plug-in point for a future per-user locale setting. */
export function recipientLocale(_input: RecipientLocaleInput): Locale {
  return appConfig.defaultLocale;
}
