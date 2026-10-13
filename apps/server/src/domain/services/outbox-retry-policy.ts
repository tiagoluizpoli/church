import { appConfig } from '@church/app-config';
import { addMinutes, type Instant, now } from '@church/time';

export function hasExhaustedRetries(attempts: number): boolean {
  return attempts >= appConfig.outbox.maxAttempts;
}

export interface NextRetryAtInput {
  attempts: number;
}

/** Exponential backoff in minutes (2^attempts), capped at one hour. */
export function nextRetryAt({ attempts }: NextRetryAtInput): Instant {
  const minutes = Math.min(2 ** attempts, appConfig.outbox.backoffCapMinutes);
  return addMinutes({ instant: now(), minutes });
}
