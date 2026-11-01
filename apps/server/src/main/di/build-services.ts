import { BetterAuthRedemptionIdentityGateway } from '../../infrastructure/services/better-auth-redemption-identity-gateway';
import { CaptureEmailSender } from '../../infrastructure/services/capture-email-sender';
import type { CompositionRootDependencies } from './dependencies';
import { auth, createServerAuth, useResetMailSender } from './server-auth';
import { captureEmailSender, serverEmailSender } from './server-email-sender';

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
  const emailSender = overrides.emailSender ?? serverEmailSender;
  useResetMailSender(emailSender);
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
