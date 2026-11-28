import { describe, expect, it } from 'vitest';
import {
  assertNotRateLimited,
  createRateLimitStore,
  isRateLimited,
} from '@/api/utils/rate-limit';
import { RefusalError } from '@/api/utils/refusal-error';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 2;
const START = 1_000_000;

let keySeed = 0;
/** The store is process-wide: each test counts against its own keys. */
function freshKey(): string {
  keySeed += 1;
  return `rate-limit-test:${keySeed}`;
}

function hit(key: string, now: number): boolean {
  return isRateLimited({
    bucket: 'redemption',
    key,
    limit: { windowMs: WINDOW_MS, maxRequests: MAX_REQUESTS },
    now,
  });
}

describe('isRateLimited', () => {
  it('allows maxRequests attempts in a window and refuses the next one', () => {
    const key = freshKey();

    expect(hit(key, START)).toBe(false);
    expect(hit(key, START + 1)).toBe(false);
    expect(hit(key, START + 2)).toBe(true);
  });

  it('counts each key on its own', () => {
    const first = freshKey();
    const second = freshKey();

    hit(first, START);
    hit(first, START + 1);

    expect(hit(second, START + 2)).toBe(false);
    expect(hit(first, START + 3)).toBe(true);
  });

  it('stops counting an attempt once it is a full window old', () => {
    const key = freshKey();

    hit(key, START);
    hit(key, START + 1);

    expect(hit(key, START + WINDOW_MS)).toBe(false);
    expect(hit(key, START + WINDOW_MS + 1)).toBe(false);
    expect(hit(key, START + WINDOW_MS + 2)).toBe(true);
  });

  it('counts refused attempts against the window too', () => {
    const key = freshKey();

    hit(key, START);
    hit(key, START + 1);
    hit(key, START + 2);

    expect(hit(key, START + WINDOW_MS)).toBe(true);
  });
});

describe('createRateLimitStore', () => {
  const policy = { windowMs: WINDOW_MS, maxRequests: MAX_REQUESTS };

  it('holds no key once its window has expired', () => {
    const store = createRateLimitStore();
    store.hit({ key: 'visitor-1', ...policy, now: START });
    store.hit({ key: 'visitor-2', ...policy, now: START + 1 });

    // One window later both visitors' attempts are stale; only the new one counts.
    store.hit({ key: 'visitor-3', ...policy, now: START + WINDOW_MS + 1 });

    expect(store.size).toBe(1);
  });

  it('keeps a key while any attempt is inside its own window', () => {
    const store = createRateLimitStore();
    store.hit({ key: 'short', windowMs: 10, maxRequests: 1, now: START });
    store.hit({ key: 'long', ...policy, now: START });

    store.hit({ key: 'other', ...policy, now: START + 11 });

    expect(store.size).toBe(2);
    expect(store.hit({ key: 'long', ...policy, now: START + 12 })).toBe(false);
    expect(store.hit({ key: 'long', ...policy, now: START + 13 })).toBe(true);
  });
});

describe('assertNotRateLimited', () => {
  it('passes within the window and refuses the next attempt with RATE_LIMITED', () => {
    const key = freshKey();
    const attempt = (now: number) =>
      assertNotRateLimited({
        bucket: 'redemption',
        key,
        limit: { windowMs: WINDOW_MS, maxRequests: MAX_REQUESTS },
        now,
      });

    attempt(START);
    attempt(START + 1);
    expect(() => attempt(START + 2)).toThrow(
      new RefusalError({ code: 'RATE_LIMITED' }),
    );
  });
});
