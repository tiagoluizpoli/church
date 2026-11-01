import { appConfig } from '@church/app-config';
import { env } from '@church/env/server';
import { BetterAuthRedemptionIdentityGateway } from '../../infrastructure/services/better-auth-redemption-identity-gateway';
import { CaptureEmailSender } from '../../infrastructure/services/capture-email-sender';
import { ResendEmailSender } from '../../infrastructure/services/resend-email-sender';
import type { CompositionRootDependencies } from './dependencies';
import { auth, createServerAuth } from './server-auth';

export type Services = Pick<
  CompositionRootDependencies,
  'redemptionIdentityGateway' | 'emailSender'
> &
  // Absent in production, where no capturing sender exists.
  Partial<Pick<CompositionRootDependencies, 'verificationCodeInspector'>>;

export interface BuildServicesInput {
  overrides: Partial<CompositionRootDependencies>;
}

export function buildServices({ overrides }: BuildServicesInput): Services {
  const redemptionIdentityGateway =
    overrides.redemptionIdentityGateway ??
    new BetterAuthRedemptionIdentityGateway({
      auth,
      createTransactionAuth: createServerAuth,
    });
  // One shared capture instance outside production: the redemption debug route
  // reads back what the verification-code manager just sent through it.
  const isProduction = env.NODE_ENV === 'production';
  const captureEmailSender = isProduction
    ? undefined
    : new CaptureEmailSender(appConfig.appName);
  const emailSender =
    overrides.emailSender ??
    captureEmailSender ??
    new ResendEmailSender({
      apiKey: env.RESEND_API_KEY ?? '',
      from: env.RESEND_FROM_EMAIL,
      appName: appConfig.appName,
    });
  const verificationCodeInspector =
    overrides.verificationCodeInspector ??
    (emailSender instanceof CaptureEmailSender
      ? emailSender
      : captureEmailSender);

  return {
    redemptionIdentityGateway,
    emailSender,
    verificationCodeInspector,
  };
}
