import { nowAsDate } from '@church/time';
import type {
  RateLimitHitInput,
  RateLimitInput,
  RateLimitStore,
  RateLimitWindow,
} from './rate-limit.types';

/** An in-process sliding window of attempt times per key. */
export function createRateLimitStore(): RateLimitStore {
  const windows = new Map<string, RateLimitWindow>();

  /** Drops every key whose newest attempt is a full window old, so the store never outgrows its live clients. */
  function dropExpired(now: number): void {
    for (const [key, { windowMs, attempts }] of windows) {
      const newest = attempts.at(-1) ?? Number.NEGATIVE_INFINITY;
      if (newest <= now - windowMs) windows.delete(key);
    }
  }

  return {
    hit({ key, windowMs, maxRequests, now }: RateLimitHitInput): boolean {
      dropExpired(now);
      const attempts = (windows.get(key)?.attempts ?? []).filter(
        (attempt) => attempt > now - windowMs,
      );
      attempts.push(now);
      windows.set(key, { windowMs, attempts });
      return attempts.length > maxRequests;
    },
    get size() {
      return windows.size;
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
