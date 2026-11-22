import { env } from '@church/env/server';
import { BetterAuthRedemptionIdentityGateway } from '../../infrastructure/services/better-auth-redemption-identity-gateway';
import { CaptureEmailSender } from '../../infrastructure/services/capture-email-sender';
import { OtelTracing } from '../../infrastructure/services/otel-tracing';
import { SentryErrorReporter } from '../../infrastructure/services/sentry-error-reporter';
import { S3ObjectStorage } from '../../infrastructure/storage/s3-object-storage';
import type { CompositionRootDependencies } from './dependencies';
import { auth, createServerAuth, useResetMailSender } from './server-auth';
import { serverEmailSender } from './server-email-sender';

export type Services = Pick<
  CompositionRootDependencies,
  | 'redemptionIdentityGateway'
  | 'emailSender'
  | 'errorReporter'
  | 'tracing'
  | 'objectStorage'
> &
  // Absent unless the sender is capture.
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
    (emailSender instanceof CaptureEmailSender ? emailSender : undefined);

  const errorReporter = overrides.errorReporter ?? new SentryErrorReporter();
  const tracing = overrides.tracing ?? new OtelTracing();
  const objectStorage =
    overrides.objectStorage ??
    new S3ObjectStorage({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      publicUrl: env.STORAGE_PUBLIC_URL,
    });

  return {
    redemptionIdentityGateway,
    emailSender,
    verificationCodeInspector,
    errorReporter,
    tracing,
    objectStorage,
  };
}
