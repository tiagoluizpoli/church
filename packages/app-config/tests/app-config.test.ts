import { describe, expect, it } from 'vitest';
import { appConfig, appConfigSchema, withAllParkedOn } from '../src';

describe('appConfig', () => {
  it('ships with every parked switch off', () => {
    expect(Object.values(appConfig.parked).every((on) => on === false)).toBe(
      true,
    );
  });
});

describe('withAllParkedOn', () => {
  it('turns every parked switch on and leaves other values untouched', () => {
    const result = withAllParkedOn(appConfig);
    expect(Object.values(result.parked).every((on) => on === true)).toBe(true);
    expect(Object.keys(result.parked)).toEqual(Object.keys(appConfig.parked));
    expect({ ...result, parked: null }).toEqual({ ...appConfig, parked: null });
    expect(appConfig.parked.auditPanel).toBe(false);
  });
});

describe('appConfigSchema', () => {
  it('refuses a zero or negative TTL', () => {
    const zero = { ...appConfig, churchInvitation: { ttlMs: 0 } };
    const negative = { ...appConfig, churchInvitation: { ttlMs: -1 } };
    expect(appConfigSchema.safeParse(zero).success).toBe(false);
    expect(appConfigSchema.safeParse(negative).success).toBe(false);
  });

  it('refuses a non-integer cap', () => {
    const fractional = {
      ...appConfig,
      invitationResend: { ...appConfig.invitationResend, dailyCap: 1.5 },
    };
    expect(appConfigSchema.safeParse(fractional).success).toBe(false);
  });

  it('refuses a non-boolean parked switch', () => {
    const bad = {
      ...appConfig,
      parked: { ...appConfig.parked, auditPanel: 1 },
    };
    expect(appConfigSchema.safeParse(bad).success).toBe(false);
  });
});

describe('locale config', () => {
  it('defaults to pt-BR, with the cookie and lang override names', () => {
    expect(appConfig.defaultLocale).toBe('pt-BR');
    expect(appConfig.localeCookieName).toBe('church_locale');
    expect(appConfig.localeQueryParam).toBe('lang');
  });

  it('refuses a locale outside en and pt-BR', () => {
    const bad = { ...appConfig, defaultLocale: 'fr' };
    expect(appConfigSchema.safeParse(bad).success).toBe(false);
  });
});

describe('notifications config', () => {
  it('defaults both sinks on and polls every two minutes', () => {
    expect(appConfig.notifications.email.enabled).toBe(true);
    expect(appConfig.notifications.inbox.enabled).toBe(true);
    expect(appConfig.notifications.pollIntervalMs).toBe(2 * 60 * 1000);
  });

  it('refuses a zero poll interval', () => {
    const bad = {
      ...appConfig,
      notifications: { ...appConfig.notifications, pollIntervalMs: 0 },
    };
    expect(appConfigSchema.safeParse(bad).success).toBe(false);
  });
});
