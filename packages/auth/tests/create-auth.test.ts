import { createDb } from '@church/db';
import { describe, expect, it, vi } from 'vitest';
import { createAuth } from '@/index';

describe('createAuth', () => {
  it('applies injected reset policy and keeps registration paths disabled', () => {
    const sendResetPassword = vi.fn();
    const built = createAuth({
      database: createDb(),
      resetPasswordTokenExpiresIn: 900,
      sendResetPassword,
      revokeSessionsOnPasswordReset: true,
    });
    expect(built.options.emailAndPassword).toMatchObject({
      resetPasswordTokenExpiresIn: 900,
      sendResetPassword,
      revokeSessionsOnPasswordReset: true,
    });
    expect(built.options.disabledPaths).toEqual([
      '/sign-up/email',
      '/organization/update-member-role',
    ]);
  });

  it('leaves recovery unavailable without options', () => {
    const built = createAuth({ database: createDb() });
    expect(built.options.emailAndPassword?.sendResetPassword).toBeUndefined();
  });
});
