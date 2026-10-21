import { m } from '@church/i18n/messages';
import { describe, expect, it } from 'vitest';
import { authErrorMessage } from '@/lib/auth-error-message';

describe('authErrorMessage', () => {
  it('words a known Better Auth error code', () => {
    expect(
      authErrorMessage({ error: { code: 'INVALID_EMAIL_OR_PASSWORD' } }),
    ).toBe(m.auth_error_invalid_email_or_password());
  });

  it('falls back to the generic error for an unknown code', () => {
    expect(authErrorMessage({ error: { code: 'SOMETHING_NEW' } })).toBe(
      m.common_generic_error(),
    );
  });

  it('falls back to the generic error when there is no code', () => {
    expect(authErrorMessage({ error: {} })).toBe(m.common_generic_error());
  });
});
