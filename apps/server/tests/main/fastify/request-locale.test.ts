import { appConfig } from '@church/app-config';
import { describe, expect, it } from 'vitest';
import { recipientLocale, requestLocale } from '@/main/fastify/request-locale';

const COOKIE = appConfig.localeCookieName;

describe('requestLocale', () => {
  it('reads a valid locale cookie', () => {
    expect(requestLocale({ headers: { cookie: `${COOKIE}=en` } })).toBe('en');
  });

  it('finds the cookie among others', () => {
    const cookie = `a=1; ${COOKIE}=pt-BR; b=2`;
    expect(requestLocale({ headers: { cookie } })).toBe('pt-BR');
  });

  it('uses the default locale without a cookie', () => {
    expect(requestLocale({ headers: {} })).toBe(appConfig.defaultLocale);
  });

  it('ignores an invalid cookie value', () => {
    expect(requestLocale({ headers: { cookie: `${COOKIE}=fr` } })).toBe(
      appConfig.defaultLocale,
    );
  });
});

describe('recipientLocale', () => {
  it('returns the default locale', () => {
    expect(recipientLocale({ userId: 'u1' })).toBe(appConfig.defaultLocale);
  });
});
