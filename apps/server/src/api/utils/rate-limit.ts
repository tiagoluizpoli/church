import { nowAsDate } from '@church/time';
import type { RateLimitInput } from './rate-limit.types';

// shortcut: in-process sliding window, per server instance; move to a shared store if the API scales out.
const attemptsByKey = new Map<string, number[]>();

/** Records an attempt for `key`; true once it exceeds `maxRequests` within the window. */
export function isRateLimited({
  key,
  windowMs,
  maxRequests,
  now = nowAsDate().getTime(),
}: RateLimitInput): boolean {
  const attempts = (attemptsByKey.get(key) ?? []).filter(
    (attempt) => attempt > now - windowMs,
  );
  attempts.push(now);
  attemptsByKey.set(key, attempts);
  return attempts.length > maxRequests;
}
