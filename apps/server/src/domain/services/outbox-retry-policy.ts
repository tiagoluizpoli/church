import { addMinutes, type Instant, now } from '@church/time';

/** Each failed attempt doubles the wait before the next retry. */
const BACKOFF_BASE = 2;

export interface OutboxRetryPolicy {
  maxAttempts: number;
  backoffCapMinutes: number;
}

export interface HasExhaustedRetriesInput {
  attempts: number;
  policy: OutboxRetryPolicy;
}

export function hasExhaustedRetries({
  attempts,
  policy,
}: HasExhaustedRetriesInput): boolean {
  const { maxAttempts } = policy;
  return attempts >= maxAttempts;
}

export interface NextRetryAtInput {
  attempts: number;
  policy: OutboxRetryPolicy;
}

/** Exponential backoff in minutes (BACKOFF_BASE^attempts), capped by the policy. */
export function nextRetryAt({ attempts, policy }: NextRetryAtInput): Instant {
  const { backoffCapMinutes } = policy;
  const minutes = Math.min(BACKOFF_BASE ** attempts, backoffCapMinutes);
  return addMinutes({ instant: now(), minutes });
}
