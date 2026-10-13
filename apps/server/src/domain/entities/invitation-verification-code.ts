import { appConfig } from '@church/app-config';
import {
  compareInstants,
  type Instant,
  millisecondsBetween,
} from '@church/time';

export interface VerificationCodeState {
  codeHash: string;
  expiresAt: Instant;
  failedAttempts: number;
  consumedAt: Instant | null;
  redemptionIdempotencyKey: string | null;
  lastSentAt: Instant;
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
  now: Instant;
}

export interface CanResendVerificationCodeInput {
  state: VerificationCodeState;
  now: Instant;
}

export function validateVerificationCode({
  state,
  candidateMatches,
  now,
}: ValidateVerificationCodeInput): VerificationCodeValidation {
  if (state.consumedAt) return { status: 'consumed' };
  if (compareInstants({ left: state.expiresAt, right: now }) <= 0) {
    return { status: 'expired' };
  }
  if (state.failedAttempts >= appConfig.verificationCode.maxAttempts) {
    return { status: 'attempt-limit-reached' };
  }
  return candidateMatches ? { status: 'valid' } : { status: 'invalid' };
}

export function canResendVerificationCode({
  state,
  now,
}: CanResendVerificationCodeInput): boolean {
  return (
    millisecondsBetween({ start: state.lastSentAt, end: now }) >=
    appConfig.verificationCode.resendCooldownMs
  );
}
