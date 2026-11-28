import { nowAsDate } from '@church/time';
import type {
  RateLimitHitInput,
  RateLimitInput,
  RateLimitStore,
} from './rate-limit.types';

/** An in-process sliding window of attempt times per key. */
export function createRateLimitStore(): RateLimitStore {
  const attemptsByKey = new Map<string, number[]>();
  return {
    hit({ key, windowMs, maxRequests, now }: RateLimitHitInput): boolean {
      const attempts = (attemptsByKey.get(key) ?? []).filter(
        (attempt) => attempt > now - windowMs,
      );
      attempts.push(now);
      attemptsByKey.set(key, attempts);
      return attempts.length > maxRequests;
    },
    get size() {
      return attemptsByKey.size;
    },
  };
}

// shortcut: in-process sliding window, per server instance; move to a shared store if the API scales out.
const store = createRateLimitStore();

/** The one rate-limit check: counts this attempt against `key`'s window in `bucket`. */
export function isRateLimited({
  bucket,
  key,
  limit,
  now = nowAsDate().getTime(),
}: RateLimitInput): boolean {
  return store.hit({ key: `${bucket}:${key}`, ...limit, now });
}
