import { describe, expect, it } from 'vitest';
import { isRateLimited } from '@/api/utils/rate-limit';

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
