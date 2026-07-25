import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomId } from './id';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('randomId', () => {
  it('returns a v4 UUID', () => {
    expect(randomId()).toMatch(UUID_V4);
  });

  it('still works where `crypto.randomUUID` does not exist', () => {
    // Exactly the LAN dev host case: plain HTTP off localhost is not a secure
    // context, so the browser exposes `getRandomValues` but not `randomUUID`,
    // and every call site throwing "randomUUID is not a function" took the
    // whole assignment with it.
    vi.stubGlobal('crypto', {
      getRandomValues: crypto.getRandomValues.bind(crypto),
    });

    expect(randomId()).toMatch(UUID_V4);
  });

  it('falls back again when there is no Web Crypto at all', () => {
    vi.stubGlobal('crypto', undefined);

    expect(randomId()).toMatch(UUID_V4);
  });

  it('does not repeat itself', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: crypto.getRandomValues.bind(crypto),
    });

    expect(new Set(Array.from({ length: 500 }, randomId)).size).toBe(500);
  });
});
