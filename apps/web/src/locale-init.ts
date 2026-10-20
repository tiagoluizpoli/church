import { appConfig } from '@church/app-config';
import {
  defineCustomClientStrategy,
  getLocale,
  isLocale,
  setLocale,
} from '@church/i18n/runtime';

// Returns appConfig.defaultLocale when no cookie is set, making pt-BR the
// default rather than the Paraglide baseLocale ('en').
defineCustomClientStrategy('custom-default', {
  getLocale: () => appConfig.defaultLocale,
  setLocale: () => {},
});

export function initLocale(): void {
  const params = new URLSearchParams(window.location.search);
  const lang = params.get(appConfig.localeQueryParam);
  if (lang !== null) {
    if (isLocale(lang)) {
      setLocale(lang, { reload: false });
    }
    params.delete(appConfig.localeQueryParam);
    const newSearch = params.toString();
    history.replaceState(
      null,
      '',
      window.location.pathname +
        (newSearch ? `?${newSearch}` : '') +
        window.location.hash,
    );
  }
  document.documentElement.lang = getLocale();
}
