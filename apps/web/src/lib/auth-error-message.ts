import { m } from '@church/i18n/messages';
import type { authClient } from '@/lib/auth-client';

type AuthErrorCode = keyof typeof authClient.$ERROR_CODES;

const AUTH_ERROR_MESSAGES = new Map<string, () => string>(
  Object.entries({
    INVALID_EMAIL_OR_PASSWORD: m.auth_error_invalid_email_or_password,
    EMAIL_NOT_VERIFIED: m.auth_error_email_not_verified,
    USER_ALREADY_EXISTS: m.auth_error_user_already_exists,
    USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
      m.auth_error_user_already_exists_use_another_email,
    PASSWORD_TOO_SHORT: m.auth_error_password_too_short,
    PASSWORD_TOO_LONG: m.auth_error_password_too_long,
  } satisfies Partial<Record<AuthErrorCode, () => string>>),
);

interface AuthErrorMessageInput {
  error: { code?: string; message?: string };
}

export function authErrorMessage({ error }: AuthErrorMessageInput): string {
  const message = error.code ? AUTH_ERROR_MESSAGES.get(error.code) : undefined;
  return message ? message() : m.common_generic_error();
}
