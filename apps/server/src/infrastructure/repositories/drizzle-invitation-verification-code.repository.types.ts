import type { AppConfig } from '@church/app-config';
import type { invitationVerificationCode } from '@church/db';
import type { AnyDrizzleDb } from './drizzle-db.types';

export interface DrizzleInvitationVerificationCodeRepositoryInput {
  db: AnyDrizzleDb;
  config: AppConfig;
}

export type InvitationVerificationCodeRow =
  typeof invitationVerificationCode.$inferSelect;

export interface MapVerificationCodeInput {
  row: InvitationVerificationCodeRow;
}
