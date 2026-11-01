import { describe, expect, it, vi } from 'vitest';
import {
  createPasswordResetMailer,
  resetLifetime,
} from '@/infrastructure/services/password-reset-mailer';

describe('resetLifetime', () => {
  it.each([
    [3_600_000, { hours: 1 }],
    [7_200_000, { hours: 2 }],
    [5_400_000, { minutes: 90 }],
    [90_000, { minutes: 1 }],
  ])('states %i ms without promising longer than the policy', (ttlMs, expected) => {
    expect(resetLifetime({ ttlMs })).toEqual(expected);
  });
});

describe('createPasswordResetMailer', () => {
  const config = {
    passwordReset: { ttlMs: 3_600_000 },
    defaultLocale: 'en',
  } as const;

  it('reports a transport failure instead of throwing it into the auth response', async () => {
    const failure = new Error('provider down');
    const onSendError = vi.fn();
    const mail = createPasswordResetMailer({
      emailSender: { send: vi.fn().mockRejectedValue(failure) },
      config,
      webOrigin: 'https://app.church.test',
      onSendError,
    });

    await expect(
      mail({ user: { email: 'a@example.test' }, token: 't' }),
    ).resolves.toBeUndefined();
    await vi.waitFor(() => expect(onSendError).toHaveBeenCalledWith(failure));
  });
});
