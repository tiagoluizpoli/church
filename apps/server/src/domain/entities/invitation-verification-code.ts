export const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
export const VERIFICATION_CODE_MAX_ATTEMPTS = 5;
export const VERIFICATION_CODE_RESEND_COOLDOWN_MS = 60 * 1000;

export interface VerificationCodeState {
  codeHash: string;
  expiresAt: Date;
  failedAttempts: number;
  consumedAt: Date | null;
  redemptionIdempotencyKey: string | null;
  lastSentAt: Date;
}

export interface ValidVerificationCodeValidation {
  status: 'valid';
}

export interface ExpiredVerificationCodeValidation {
  status: 'expired';
}

export interface ConsumedVerificationCodeValidation {
  status: 'consumed';
}

export interface AttemptLimitReachedVerificationCodeValidation {
  status: 'attempt-limit-reached';
}

export interface InvalidVerificationCodeValidation {
  status: 'invalid';
}

export type VerificationCodeValidation =
  | ValidVerificationCodeValidation
  | ExpiredVerificationCodeValidation
  | ConsumedVerificationCodeValidation
  | AttemptLimitReachedVerificationCodeValidation
  | InvalidVerificationCodeValidation;

export interface ValidateVerificationCodeInput {
  state: VerificationCodeState;
  candidateMatches: boolean;
  now: Date;
}

export interface CanResendVerificationCodeInput {
  state: VerificationCodeState;
  now: Date;
}

export function validateVerificationCode({
  state,
  candidateMatches,
  now,
}: ValidateVerificationCodeInput): VerificationCodeValidation {
  if (state.consumedAt) return { status: 'consumed' };
  if (state.expiresAt <= now) return { status: 'expired' };
  if (state.failedAttempts >= VERIFICATION_CODE_MAX_ATTEMPTS) {
    return { status: 'attempt-limit-reached' };
  }
  return candidateMatches ? { status: 'valid' } : { status: 'invalid' };
}

export function canResendVerificationCode({
  state,
  now,
}: CanResendVerificationCodeInput): boolean {
  return (
    now.getTime() - state.lastSentAt.getTime() >=
    VERIFICATION_CODE_RESEND_COOLDOWN_MS
  );
}
