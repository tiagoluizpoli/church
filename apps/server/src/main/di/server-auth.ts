import { appConfig } from '@church/app-config';
import { type CreateAuthInput, createAuth } from '@church/auth';
import { db } from '@church/db';
import { env } from '@church/env/server';
import type { EmailSender } from '../../domain/contracts/infrastructure/email-sender';
import { createPasswordResetMailer } from '../../infrastructure/services/password-reset-mailer';
import { serverEmailSender } from './server-email-sender';

const MS_PER_SECOND = 1000;

export type ServerAuthOptions = Omit<CreateAuthInput, 'database'>;

export type CreateServerAuthInput = Pick<CreateAuthInput, 'database'>;

let resetMailSender: Pick<EmailSender, 'send'> = serverEmailSender;

/**
 * Composition points reset mail at its resolved sender. The one auth instance
 * is built at import, so the mailer reads this binding at send time instead.
 */
export function useResetMailSender(sender: Pick<EmailSender, 'send'>) {
  resetMailSender = sender;
}

/** The one policy set every server auth instance is built from. */
export const serverAuthOptions: ServerAuthOptions = {
  organizationMembershipLimit: appConfig.auth.organizationMembershipLimit,
  resetPasswordTokenExpiresIn: appConfig.passwordReset.ttlMs / MS_PER_SECOND,
  revokeSessionsOnPasswordReset: true,
  sendResetPassword: createPasswordResetMailer({
    emailSender: { send: (input) => resetMailSender.send(input) },
    config: appConfig,
    webOrigin: env.CORS_ORIGIN,
    // Message only: the error object may carry the request, token included.
    onSendError: (error) =>
      console.error(
        'Password reset email failed',
        error instanceof Error ? error.message : 'unknown error',
      ),
  }),
};

/** Same configuration, any database: the request instance or a transaction. */
export function createServerAuth({ database }: CreateServerAuthInput) {
  return createAuth({ database, ...serverAuthOptions });
}

export type ServerAuthFactory = typeof createServerAuth;

export const auth = createServerAuth({ database: db });
