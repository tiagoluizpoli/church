import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { AppConfig } from '@church/app-config';
import {
  addMilliseconds,
  compareInstants,
  fromDate,
  nowAsDate,
  toDate,
} from '@church/time';
import type { MinistryInvitationId } from '../domain/branded-ids';
import type { InvitationVerificationCodeManager as InvitationVerificationCodeManagerContract } from '../domain/contracts/application/invitation-verification-code-manager';
import type { EmailSender } from '../domain/contracts/infrastructure/email-sender';
import type { InvitationVerificationCodeRepository } from '../domain/contracts/infrastructure/invitation-verification-code.repository';
import { validateVerificationCode } from '../domain/entities/invitation-verification-code';
import { VerificationCodeError } from '../domain/errors/verification-code-error';
import { recipientLocale } from '../domain/services/recipient-locale';

const MS_PER_MINUTE = 60_000;

export interface IssueVerificationCodeInput {
  ministryInvitationId: MinistryInvitationId;
  recipientEmail: string;
  churchName: string;
  now?: Date;
}

export interface VerifyInvitationCodeInput {
  ministryInvitationId: MinistryInvitationId;
  code: string;
  idempotencyKey?: string;
  now?: Date;
}

interface VerificationCodeManagerDependencies {
  repository: InvitationVerificationCodeRepository;
  /** Sends directly: a Transactional email with no outbox row to key on. */
  emailSender: Pick<EmailSender, 'send'>;
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

interface VerificationCodeValidationErrorInput {
  status: ReturnType<typeof validateVerificationCode>['status'];
}

export class InvitationVerificationCodeManager
  implements InvitationVerificationCodeManagerContract
{
  private readonly repository: InvitationVerificationCodeRepository;
  private readonly emailSender: Pick<EmailSender, 'send'>;
  private readonly generateCode: () => string;
  private readonly verificationCodeSecret: string;
  private readonly codeTtlMs: number;
  private readonly verificationPolicy: AppConfig['verificationCode'];
  private readonly defaultLocale: AppConfig['defaultLocale'];
  /** Whole minutes, so the email never promises longer than the policy. */
  private readonly codeLifetimeMinutes: number;

  constructor({
    repository,
    emailSender,
    generateCode,
    verificationCodeSecret,
    config,
  }: VerificationCodeManagerDependencies) {
    this.repository = repository;
    this.emailSender = emailSender;
    this.generateCode = generateCode ?? generateVerificationCode;
    this.verificationCodeSecret = verificationCodeSecret;
    const { verificationCode, defaultLocale } = config;
    this.codeTtlMs = verificationCode.ttlMs;
    this.verificationPolicy = verificationCode;
    this.defaultLocale = defaultLocale;
    this.codeLifetimeMinutes = Math.floor(
      verificationCode.ttlMs / MS_PER_MINUTE,
    );
  }

  async issue({
    ministryInvitationId,
    recipientEmail,
    churchName,
    now = nowAsDate(),
  }: IssueVerificationCodeInput): Promise<void> {
    const code = this.generateCode();
    const codeHash = hashVerificationCode({
      code,
      secret: this.verificationCodeSecret,
    });
    const expiresAt = addMilliseconds({
      instant: fromDate({ date: now }),
      milliseconds: this.codeTtlMs,
    });
    const claimed = await this.repository.claimDelivery({
      ministryInvitationId,
      codeHash,
      expiresAt: toDate({ instant: expiresAt }),
      sentAt: now,
    });
    if (!claimed) {
      throw new VerificationCodeError({
        code: 'VERIFICATION_CODE_RESEND_COOLDOWN_ACTIVE',
      });
    }
    const locale = recipientLocale({
      recipient: { email: recipientEmail },
      defaultLocale: this.defaultLocale,
    });
    try {
      await this.emailSender.send({
        payload: {
          kind: 'invitation.verification-code',
          to: recipientEmail,
          churchName,
          code,
          codeLifetime: { minutes: this.codeLifetimeMinutes },
        },
        locale,
      });
    } catch (error) {
      await this.repository.releaseDeliveryClaim({
        ministryInvitationId,
        codeHash,
        sentAt: now,
      });
      throw error;
    }
  }

  async verify({
    ministryInvitationId,
    code,
    idempotencyKey,
    now = nowAsDate(),
  }: VerifyInvitationCodeInput): Promise<void> {
    const nowInstant = fromDate({ date: now });
    const state = await this.repository.find({ ministryInvitationId });
    if (!state)
      throw new VerificationCodeError({ code: 'VERIFICATION_CODE_NOT_FOUND' });
    const candidateHash = hashVerificationCode({
      code,
      secret: this.verificationCodeSecret,
    });
    if (
      state.consumedAt &&
      idempotencyKey &&
      state.redemptionIdempotencyKey === idempotencyKey &&
      compareInstants({ left: state.expiresAt, right: nowInstant }) > 0 &&
      verifyVerificationCodeHash({
        codeHash: state.codeHash,
        candidateHash,
      })
    ) {
      return;
    }
    const candidateMatches = verifyVerificationCodeHash({
      codeHash: state.codeHash,
      candidateHash,
    });
    const outcome = validateVerificationCode({
      state,
      policy: this.verificationPolicy,
      candidateMatches,
      now: nowInstant,
    });
    if (outcome.status === 'valid') {
      const consumed = await this.repository.consumeIfValid({
        ministryInvitationId,
        candidateHash,
        consumedAt: now,
        now,
        redemptionIdempotencyKey: idempotencyKey,
      });
      if (consumed) return;
    }
    if (outcome.status === 'invalid') {
      const recorded = await this.repository.recordFailedAttemptIfAllowed({
        ministryInvitationId,
        candidateHash,
        now,
      });
      if (recorded) {
        throw new VerificationCodeError({ code: 'VERIFICATION_CODE_INVALID' });
      }
    }
    const current = await this.repository.find({ ministryInvitationId });
    if (!current) {
      throw new VerificationCodeError({ code: 'VERIFICATION_CODE_NOT_FOUND' });
    }
    const currentCandidateMatches = verifyVerificationCodeHash({
      codeHash: current.codeHash,
      candidateHash,
    });
    const currentOutcome = validateVerificationCode({
      state: current,
      policy: this.verificationPolicy,
      candidateMatches: currentCandidateMatches,
      now: nowInstant,
    });
    throw new VerificationCodeError({
      code: toErrorCode({ status: currentOutcome.status }),
    });
  }
}

function generateVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashVerificationCode({
  code,
  secret,
}: HashVerificationCodeInput): string {
  return createHmac('sha256', secret).update(code).digest('hex');
}

export function verifyVerificationCodeHash({
  codeHash,
  candidateHash,
}: VerifyVerificationCodeHashInput): boolean {
  const expected = Buffer.from(codeHash, 'hex');
  const candidate = Buffer.from(candidateHash, 'hex');
  return (
    expected.length === candidate.length && timingSafeEqual(expected, candidate)
  );
}

function toErrorCode({
  status,
}: VerificationCodeValidationErrorInput): VerificationCodeError['code'] {
  const codes = {
    expired: 'VERIFICATION_CODE_EXPIRED',
    consumed: 'VERIFICATION_CODE_CONSUMED',
    'attempt-limit-reached': 'VERIFICATION_CODE_ATTEMPT_LIMIT_REACHED',
    invalid: 'VERIFICATION_CODE_INVALID',
    valid: 'VERIFICATION_CODE_INVALID',
  } as const;
  return codes[status];
}
