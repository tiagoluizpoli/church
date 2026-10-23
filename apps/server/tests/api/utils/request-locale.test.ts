import { describe, expect, it } from 'vitest';
import { requestLocale } from '@/api/utils/request-locale';

const COOKIE = 'lang';
const settings = { localeCookieName: COOKIE, defaultLocale: 'pt-BR' } as const;

describe('requestLocale', () => {
  it('reads a valid locale cookie', () => {
    expect(requestLocale({ cookieHeader: `${COOKIE}=en`, ...settings })).toBe(
      'en',
    );
  });

  it('finds the cookie among others', () => {
    const cookieHeader = `a=1; ${COOKIE}=en; b=2`;
    expect(requestLocale({ cookieHeader, ...settings })).toBe('en');
  });

  it('uses the default locale without a cookie', () => {
    expect(requestLocale({ cookieHeader: undefined, ...settings })).toBe(
      'pt-BR',
    );
  });

  it('ignores an invalid cookie value', () => {
    expect(requestLocale({ cookieHeader: `${COOKIE}=fr`, ...settings })).toBe(
      'pt-BR',
    );
  });
});
