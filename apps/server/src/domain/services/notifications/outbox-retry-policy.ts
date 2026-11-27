import { addMinutes, type Instant, now } from '@church/time';
import type {
  HasExhaustedRetriesInput,
  NextRetryAtInput,
} from './outbox-retry-policy.types';

/** Each failed attempt doubles the wait before the next retry. */
const BACKOFF_BASE = 2;

export function hasExhaustedRetries({
  attempts,
  policy,
}: HasExhaustedRetriesInput): boolean {
  const { maxAttempts } = policy;
  return attempts >= maxAttempts;
}

/** Exponential backoff in minutes (BACKOFF_BASE^attempts), capped by the policy. */
export function nextRetryAt({ attempts, policy }: NextRetryAtInput): Instant {
  const { backoffCapMinutes } = policy;
  const minutes = Math.min(BACKOFF_BASE ** attempts, backoffCapMinutes);
  return addMinutes({ instant: now(), minutes });
}
