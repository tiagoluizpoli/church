import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMediaQuery } from './use-media-query';

interface MockMatchMediaInput {
  matches: boolean;
}

interface MutableMediaQueryList {
  matches: boolean;
  media: string;
  addEventListener: (
    event: 'change',
    listener: (event: MediaQueryListEvent) => void,
  ) => void;
  removeEventListener: (
    event: 'change',
    listener: (event: MediaQueryListEvent) => void,
  ) => void;
}

function mockMatchMedia({ matches }: MockMatchMediaInput) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mql: MutableMediaQueryList = {
    matches,
    media: '(min-width: 768px)',
    addEventListener: (_event, listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_event, listener) => {
      listeners.delete(listener);
    },
  };

  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue(mql as unknown as MediaQueryList),
  );

  return {
    fireChange: (nextMatches: boolean) => {
      mql.matches = nextMatches;
      for (const listener of listeners) {
        listener({ matches: nextMatches } as MediaQueryListEvent);
      }
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMediaQuery', () => {
  it('returns true when the mocked media query currently matches', () => {
    mockMatchMedia({ matches: true });

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    expect(result.current).toBe(true);
  });

  it('returns false when the mocked media query does not match', () => {
    mockMatchMedia({ matches: false });

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    expect(result.current).toBe(false);
  });

  it('updates when the media query list fires a change event', () => {
    const { fireChange } = mockMatchMedia({ matches: false });

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);

    act(() => {
      fireChange(true);
    });

    expect(result.current).toBe(true);
  });
});
