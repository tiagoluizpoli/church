import type { Resend } from 'resend';

export interface SendViaResendInput {
  request: Parameters<Resend['emails']['send']>[0];
  idempotencyKey?: string;
}
