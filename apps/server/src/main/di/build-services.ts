import { availableParallelism } from 'node:os';
import { env } from '@church/env/server';
import { BetterAuthRedemptionIdentityGateway } from '../../infrastructure/services/better-auth-redemption-identity-gateway';
import { CaptureEmailSender } from '../../infrastructure/services/capture-email-sender';
import { HttpWebShell } from '../../infrastructure/services/http-web-shell';
import { OtelTracing } from '../../infrastructure/services/otel-tracing';
import { SentryErrorReporter } from '../../infrastructure/services/sentry-error-reporter';
import { S3ObjectStorage } from '../../infrastructure/storage/s3-object-storage';
import { TypstCliRenderer } from '../../infrastructure/typst/typst-cli-renderer';
import {
  TYPST_BINARY,
  TYPST_FONTS_DIR,
  TYPST_TEMPLATES_DIR,
} from '../../infrastructure/typst/typst-paths';
import type { BuildServicesInput, Services } from './build-services.types';
import { auth, createServerAuth, useResetMailSender } from './server-auth';
import { serverEmailSender } from './server-email-sender';

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

  const typstRenderer =
    overrides.typstRenderer ??
    new TypstCliRenderer({
      objectStorage,
      config: {
        binary: TYPST_BINARY,
        fontsDir: TYPST_FONTS_DIR,
        templatesDir: TYPST_TEMPLATES_DIR,
        timeoutMs: 10_000,
        cacheBytes: 100 * 1024 * 1024,
        concurrency: availableParallelism(),
      },
    });

  const webShell =
    overrides.webShell ??
    new HttpWebShell({
      publicOrigin: env.CORS_ORIGIN,
      internalUrl: env.WEB_INTERNAL_URL,
    });

  return {
    webShell,
    redemptionIdentityGateway,
    emailSender,
    verificationCodeInspector,
    errorReporter,
    tracing,
    objectStorage,
    typstRenderer,
  };
}
