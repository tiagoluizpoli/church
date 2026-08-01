import { DomainError } from '@church/core';

export type VerificationCodeErrorCode =
  | 'VERIFICATION_CODE_ATTEMPT_LIMIT_REACHED'
  | 'VERIFICATION_CODE_CONSUMED'
  | 'VERIFICATION_CODE_EXPIRED'
  | 'VERIFICATION_CODE_INVALID'
  | 'VERIFICATION_CODE_NOT_FOUND'
  | 'VERIFICATION_CODE_RESEND_COOLDOWN_ACTIVE';

export interface VerificationCodeErrorInput {
  code: VerificationCodeErrorCode;
}

export class VerificationCodeError extends DomainError {
  readonly code: VerificationCodeErrorCode;

  constructor({ code }: VerificationCodeErrorInput) {
    super('Verification code could not be accepted');
    this.code = code;
  }
}
