import type { AppConfig } from '@church/app-config';
import type { EmailSender } from '../../domain/contracts/infrastructure/email-sender';

export interface PasswordResetMailerInput {
  emailSender: Pick<EmailSender, 'send'>;
  config: Pick<AppConfig, 'passwordReset' | 'defaultLocale'>;
  /** The web origin the emailed `/reset-password` link points at. */
  webOrigin: string;
  onSendError: (error: unknown) => void;
}
