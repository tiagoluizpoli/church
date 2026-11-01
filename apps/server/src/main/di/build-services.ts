import { createAuth } from '@church/auth';
import { env } from '@church/env/server';
import { BetterAuthRedemptionIdentityGateway } from '../../infrastructure/services/better-auth-redemption-identity-gateway';
import { CaptureEmailSender } from '../../infrastructure/services/capture-email-sender';
import { createPasswordResetMailer } from '../../infrastructure/services/password-reset-mailer';
import { ResendEmailSender } from '../../infrastructure/services/resend-email-sender';
import type { CompositionRootDependencies } from './dependencies';

const MS_PER_SECOND = 1000;

export type Services = Pick<
  CompositionRootDependencies,
  'redemptionIdentityGateway' | 'emailSender' | 'betterAuth'
> &
  // Absent in production, where no capturing sender exists.
  Partial<Pick<CompositionRootDependencies, 'verificationCodeInspector'>>;

export interface BuildServicesInput {
  config: CompositionRootDependencies['config'];
  database: CompositionRootDependencies['db'];
  overrides: Partial<CompositionRootDependencies>;
}

export function buildServices({
  config,
  database,
  overrides,
}: BuildServicesInput): Services {
  // One shared capture instance outside production: the redemption debug route
  // reads back what the verification-code manager just sent through it.
  const isProduction = env.NODE_ENV === 'production';
  const captureEmailSender = isProduction
    ? undefined
    : new CaptureEmailSender(config.appName);
  const emailSender =
    overrides.emailSender ??
    captureEmailSender ??
    new ResendEmailSender({
      apiKey: env.RESEND_API_KEY ?? '',
      from: env.RESEND_FROM_EMAIL,
      appName: config.appName,
    });
  const verificationCodeInspector =
    overrides.verificationCodeInspector ??
    (emailSender instanceof CaptureEmailSender
      ? emailSender
      : captureEmailSender);

  // One instance for HTTP auth and redemption, so reset policy cannot diverge.
  const betterAuth =
    overrides.betterAuth ??
    createAuth({
      database,
      resetPasswordTokenExpiresIn: config.passwordReset.ttlMs / MS_PER_SECOND,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: createPasswordResetMailer({
        emailSender,
        config,
        webOrigin: env.CORS_ORIGIN,
        // Message only: the error object may carry the request, token included.
        onSendError: (error) =>
          console.error(
            'Password reset email failed',
            error instanceof Error ? error.message : 'unknown error',
          ),
      }),
    });
  const redemptionIdentityGateway =
    overrides.redemptionIdentityGateway ??
    new BetterAuthRedemptionIdentityGateway({ auth: betterAuth });

  return {
    betterAuth,
    redemptionIdentityGateway,
    emailSender,
    verificationCodeInspector,
  };
}
