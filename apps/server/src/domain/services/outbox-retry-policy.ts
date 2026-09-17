import { addMinutes, type Instant, now } from '@church/time';

/** After this many attempts, a retryable failure still gives up for good. */
export const OUTBOX_MAX_ATTEMPTS = 5;

const BACKOFF_CAP_MINUTES = 60;

export function hasExhaustedRetries(attempts: number): boolean {
  return attempts >= OUTBOX_MAX_ATTEMPTS;
}

export interface NextRetryAtInput {
  attempts: number;
}

/** Exponential backoff in minutes (2^attempts), capped at one hour. */
export function nextRetryAt({ attempts }: NextRetryAtInput): Instant {
  const minutes = Math.min(2 ** attempts, BACKOFF_CAP_MINUTES);
  return addMinutes({ instant: now(), minutes });
}
