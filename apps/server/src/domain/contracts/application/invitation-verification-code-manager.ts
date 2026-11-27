import type { AppConfig } from '@church/app-config';
import type { fromDate } from '@church/time';
import type { ChurchId, ChurchInvitationId } from '../../branded-ids';
import type {
  VerificationCodeState,
  validateVerificationCode,
} from '../../entities/invitation-verification-code';
import type { ChurchIdentitySnapshotter } from './church-identity-snapshotter';
import type { EmailSender } from '@/domain/contracts/infrastructure/email-sender';
import type { InvitationVerificationCodeRepository } from '@/domain/contracts/infrastructure/invitation-verification-code.repository';

export interface IssueInvitationVerificationCodeInput {
  churchId: ChurchId;
  churchInvitationId: ChurchInvitationId;
  recipientEmail: string;
  churchName: string;
  now?: Date;
}

export interface VerifyInvitationVerificationCodeInput {
  churchInvitationId: ChurchInvitationId;
  code: string;
  idempotencyKey?: string;
  now?: Date;
}

export interface IInvitationVerificationCodeManager {
  issue(input: IssueInvitationVerificationCodeInput): Promise<void>;
  verify(input: VerifyInvitationVerificationCodeInput): Promise<void>;
}

export interface VerificationCodeManagerDependencies {
  repository: InvitationVerificationCodeRepository;
  /** Sends directly: a Transactional email with no outbox row to key on. */
  emailSender: Pick<EmailSender, 'send'>;
  churchIdentity: ChurchIdentitySnapshotter;
  generateCode?: () => string;
  verificationCodeSecret: string;
  config: AppConfig;
}

export interface HashVerificationCodeInput {
  code: string;
  secret: string;
}

export interface VerifyVerificationCodeHashInput {
  candidateHash: string;
  codeHash: string;
}

export interface VerificationCodeValidationErrorInput {
  status: ReturnType<typeof validateVerificationCode>['status'];
}

export interface SameKeyReplayInput {
  state: VerificationCodeState;
  idempotencyKey: string | undefined;
  candidateHash: string;
  nowInstant: ReturnType<typeof fromDate>;
}
