import { appConfig } from '@church/app-config';
import { overwriteGetLocale } from '@church/i18n/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initLocale } from '@/locale-init';

const { localeCookieName, localeQueryParam } = appConfig;

function stubLocation(search: string) {
  vi.stubGlobal('location', { search, pathname: '/', hash: '' });
}

function cookieValue(): string | undefined {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${localeCookieName}=`))
    ?.split('=')[1];
}

function clearLocaleCookie() {
  document.cookie = `${localeCookieName}=; Max-Age=0; path=/`;
}

describe('locale boot', () => {
  let replaceSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearLocaleCookie();
    document.documentElement.lang = '';
    replaceSpy = vi
      .spyOn(history, 'replaceState')
      .mockImplementation(vi.fn() as typeof history.replaceState);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    overwriteGetLocale(() => 'pt-BR');
  });

  it('writes locale cookie and strips param for valid ?lang=en', () => {
    stubLocation(`?${localeQueryParam}=en`);

    initLocale();

    expect(cookieValue()).toBe('en');
    expect(replaceSpy).toHaveBeenCalledWith(null, '', '/');
  });

  it('strips param but does not write cookie for invalid ?lang=xx', () => {
    stubLocation(`?${localeQueryParam}=xx`);

    initLocale();

    expect(cookieValue()).toBeUndefined();
    expect(replaceSpy).toHaveBeenCalled();
  });

  it('sets html lang to pt-BR with no param and no cookie', () => {
    stubLocation('');

    initLocale();

    expect(document.documentElement.lang).toBe('pt-BR');
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('sets html lang to the active locale', () => {
    stubLocation('');
    overwriteGetLocale(() => 'en');

    initLocale();

    expect(document.documentElement.lang).toBe('en');
  });
});
