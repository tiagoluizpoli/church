import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { MinistryInvitationId } from '../domain/branded-ids';
import type { InvitationVerificationCodeManager as InvitationVerificationCodeManagerContract } from '../domain/contracts/application/invitation-verification-code-manager';
import type { EmailSender } from '../domain/contracts/infrastructure/email-sender';
import type { InvitationVerificationCodeRepository } from '../domain/contracts/infrastructure/invitation-verification-code.repository';
import {
  VERIFICATION_CODE_TTL_MS,
  validateVerificationCode,
} from '../domain/entities/invitation-verification-code';
import { VerificationCodeError } from '../domain/errors/verification-code-error';

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

export interface VerificationCodeManagerDependencies {
  repository: InvitationVerificationCodeRepository;
  emailSender: EmailSender;
  generateCode?: () => string;
  verificationCodeSecret: string;
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
  constructor({
    repository,
    emailSender,
    generateCode,
    verificationCodeSecret,
  }: VerificationCodeManagerDependencies) {
    this.repository = repository;
    this.emailSender = emailSender;
    this.generateCode = generateCode ?? generateVerificationCode;
    this.verificationCodeSecret = verificationCodeSecret;
  }

  private readonly repository: InvitationVerificationCodeRepository;
  private readonly emailSender: EmailSender;
  private readonly generateCode: () => string;
  private readonly verificationCodeSecret: string;

  async issue({
    ministryInvitationId,
    recipientEmail,
    churchName,
    now = new Date(),
  }: IssueVerificationCodeInput): Promise<void> {
    const code = this.generateCode();
    const codeHash = hashVerificationCode({
      code,
      secret: this.verificationCodeSecret,
    });
    const claimed = await this.repository.claimDelivery({
      ministryInvitationId,
      codeHash,
      expiresAt: new Date(now.getTime() + VERIFICATION_CODE_TTL_MS),
      sentAt: now,
    });
    if (!claimed) {
      throw new VerificationCodeError({
        code: 'VERIFICATION_CODE_RESEND_COOLDOWN_ACTIVE',
      });
    }
    try {
      await this.emailSender.send({
        payload: {
          kind: 'invitation.verification-code',
          to: recipientEmail,
          churchName,
          code,
        },
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
    now = new Date(),
  }: VerifyInvitationCodeInput): Promise<void> {
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
      state.expiresAt > now &&
      verifyVerificationCodeHash({
        codeHash: state.codeHash,
        candidateHash,
      })
    ) {
      return;
    }
    const outcome = validateVerificationCode({
      state,
      candidateMatches: verifyVerificationCodeHash({
        codeHash: state.codeHash,
        candidateHash,
      }),
      now,
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
    const currentOutcome = validateVerificationCode({
      state: current,
      candidateMatches: verifyVerificationCodeHash({
        codeHash: current.codeHash,
        candidateHash,
      }),
      now,
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
