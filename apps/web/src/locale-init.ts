import { appConfig } from '@church/app-config';
import { getLocale, isLocale, setLocale } from '@church/i18n/runtime';

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
