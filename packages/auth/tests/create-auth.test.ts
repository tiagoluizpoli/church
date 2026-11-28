import { createDb } from '@church/db';
import { describe, expect, it, vi } from 'vitest';
import { createAuth } from '@/index';

describe('createAuth', () => {
  it('applies injected reset policy and keeps registration disabled', () => {
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
    expect(built.options.disabledPaths?.[0]).toBe('/sign-up/email');
  });

  // Allowlist (#1088): the app calls no organization route over HTTP, so all
  // 22 that Better Auth 1.7.7 registers are closed. A route an upgrade adds
  // closes by default and shows up here.
  it('closes every organization route the app does not call', () => {
    const built = createAuth({ database: createDb() });
    expect(built.options.disabledPaths).toEqual([
      '/sign-up/email',
      '/organization/accept-invitation',
      '/organization/cancel-invitation',
      '/organization/check-slug',
      '/organization/create',
      '/organization/delete',
      '/organization/get-active-member',
      '/organization/get-active-member-role',
      '/organization/get-full-organization',
      '/organization/get-invitation',
      '/organization/get-organization',
      '/organization/has-permission',
      '/organization/invite-member',
      '/organization/leave',
      '/organization/list',
      '/organization/list-invitations',
      '/organization/list-members',
      '/organization/list-user-invitations',
      '/organization/reject-invitation',
      '/organization/remove-member',
      '/organization/set-active',
      '/organization/update',
      '/organization/update-member-role',
    ]);
  });

  it('leaves recovery unavailable without options', () => {
    const built = createAuth({ database: createDb() });
    expect(built.options.emailAndPassword?.sendResetPassword).toBeUndefined();
  });
});
