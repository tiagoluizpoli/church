import { appConfig } from '@church/app-config';
import { defineCustomClientStrategy } from '@church/i18n/runtime';

// Returns appConfig.defaultLocale when no cookie is set, making pt-BR the
// default rather than the Paraglide baseLocale ('en'). Imported first by the
// web entry so it is registered before any getLocale() caller runs.
defineCustomClientStrategy('custom-app-default-locale', {
  getLocale: () => appConfig.defaultLocale,
  setLocale: () => {},
});
