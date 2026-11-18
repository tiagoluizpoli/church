import type { AppConfig } from '@church/app-config';
import type {
  EmailDuration,
  EmailSender,
} from '../../domain/contracts/infrastructure/email-sender';
import { recipientLocale } from '../../domain/services/recipient-locale';

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

export interface PasswordResetMailerInput {
  emailSender: Pick<EmailSender, 'send'>;
  config: Pick<AppConfig, 'passwordReset' | 'defaultLocale'>;
  /** The web origin the emailed `/reset-password` link points at. */
  webOrigin: string;
  onSendError: (error: unknown) => void;
}

export interface PasswordResetMailInput {
  user: { email: string };
  token: string;
}

/** Whole hours when the policy is a whole number of them, else whole minutes
 * (rounded down, so the email never promises longer than the policy). */
export function resetLifetime({
  ttlMs,
}: Pick<AppConfig['passwordReset'], 'ttlMs'>): EmailDuration {
  const minutes = Math.floor(ttlMs / MS_PER_MINUTE);
  return minutes % MINUTES_PER_HOUR === 0
    ? { hours: minutes / MINUTES_PER_HOUR }
    : { minutes };
}

/**
 * The generic auth-factory `sendResetPassword` callback: emails T3 to the
 * address Better Auth found. Not awaited, so a known address does not answer
 * slower than an unknown one; a transport failure is reported, never thrown,
 * so it cannot reveal that the address is registered.
 */
export function createPasswordResetMailer({
  emailSender,
  config,
  webOrigin,
  onSendError,
}: PasswordResetMailerInput) {
  const { passwordReset, defaultLocale } = config;
  const linkLifetime = resetLifetime({ ttlMs: passwordReset.ttlMs });

  return async ({ user, token }: PasswordResetMailInput): Promise<void> => {
    const resetUrl = new URL('/reset-password', webOrigin);
    resetUrl.searchParams.set('token', token);
    const { email } = user;
    const locale = recipientLocale({ recipient: { email }, defaultLocale });
    emailSender
      .send({
        payload: {
          kind: 'auth.password-reset',
          to: email,
          resetUrl: resetUrl.toString(),
          linkLifetime,
        },
        locale,
      })
      .catch(onSendError);
  };
}
