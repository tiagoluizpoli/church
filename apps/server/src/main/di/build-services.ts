import { env } from '@church/env/server';
import { BetterAuthRedemptionIdentityGateway } from '../../infrastructure/services/better-auth-redemption-identity-gateway';
import { CaptureEmailSender } from '../../infrastructure/services/capture-email-sender';
import { LocalNotificationService } from '../../infrastructure/services/local-notification-service';
import { ResendEmailSender } from '../../infrastructure/services/resend-email-sender';
import type { Repositories } from './build-repositories';
import type { CompositionRootDependencies } from './dependencies';

export type Services = Pick<
  CompositionRootDependencies,
  'notificationService' | 'redemptionIdentityGateway' | 'emailSender'
> &
  // Absent in production, where no capturing sender exists.
  Partial<Pick<CompositionRootDependencies, 'verificationCodeInspector'>>;

export interface BuildServicesInput {
  repositories: Pick<Repositories, 'volunteerNotificationRepository'>;
  overrides: Partial<CompositionRootDependencies>;
}

export function buildServices({
  repositories: { volunteerNotificationRepository },
  overrides,
}: BuildServicesInput): Services {
  const notificationService =
    overrides.notificationService ??
    new LocalNotificationService({
      volunteerNotificationRepo: volunteerNotificationRepository,
    });
  const redemptionIdentityGateway =
    overrides.redemptionIdentityGateway ??
    new BetterAuthRedemptionIdentityGateway();
  // One shared capture instance outside production: the redemption debug route
  // reads back what the verification-code manager just sent through it.
  const isProduction = env.NODE_ENV === 'production';
  const captureEmailSender = isProduction
    ? undefined
    : new CaptureEmailSender();
  const emailSender =
    overrides.emailSender ??
    captureEmailSender ??
    new ResendEmailSender({
      apiKey: env.RESEND_API_KEY ?? '',
      from: env.RESEND_FROM_EMAIL,
    });
  const verificationCodeInspector =
    overrides.verificationCodeInspector ??
    (emailSender instanceof CaptureEmailSender
      ? emailSender
      : captureEmailSender);

  return {
    notificationService,
    redemptionIdentityGateway,
    emailSender,
    verificationCodeInspector,
  };
}
