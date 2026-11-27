import type { EmailSender } from '../../domain/contracts/infrastructure/email-sender';
import type { PlatformBranding } from '../../domain/contracts/infrastructure/email-templates';
import type { RuntimeConfigurationRepository } from '../../domain/contracts/infrastructure/runtime-configuration.repository';
import type { CaptureEmailSender } from '../../infrastructure/services/capture-email-sender';

export type DevEmailSender = 'smtp' | 'resend' | 'capture';

export type ChurchEnvironment =
  | 'local'
  | 'development'
  | 'staging'
  | 'production';

export interface EmailSenderConfig {
  nodeEnv: 'development' | 'production' | 'test';
  environment: ChurchEnvironment;
  /** Read per email in development and staging only. */
  runtimeConfiguration: RuntimeConfigurationRepository;
  /** Development selection; unset means SMTP. Ignored in test and production. */
  devSender: DevEmailSender | undefined;
  appName: string;
  platform?: PlatformBranding;
  resend: { apiKey: string | undefined; from: string };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    requireTls?: boolean;
    user?: string;
    password?: string;
    from: string;
  };
}

export interface EmailSenders {
  serverEmailSender: EmailSender;
  /** Present only when capture is the selected sender. */
  captureEmailSender: CaptureEmailSender | undefined;
}

export type SenderChoice = DevEmailSender | 'delivery-mode';
