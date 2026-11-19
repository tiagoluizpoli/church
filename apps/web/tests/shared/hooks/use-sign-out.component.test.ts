import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useSignOut } from '@/shared/hooks/use-sign-out';
import { MY_SCHEDULE_STORAGE_PREFIX } from '@/shared/utils/my-schedule-storage';
import { STORAGE_PREFIX } from '@/shared/utils/notification-storage';

const mockNavigate = vi.fn();
const signOut = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));
vi.mock('@/lib/auth-client', () => ({
  authClient: { signOut: (options: unknown) => signOut(options) },
}));

describe('useSignOut', () => {
  it('leaves the signed-in pages, then drops the cached inbox from the query cache and storage', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['notifications'], { items: [] });
    window.localStorage.setItem(`${STORAGE_PREFIX}:church-a:user-a`, '[]');
    const myScheduleKey = `${MY_SCHEDULE_STORAGE_PREFIX}:user-a:church-a:schedule`;
    window.localStorage.setItem(myScheduleKey, '{}');
    const { result } = renderHook(() => useSignOut(), {
      wrapper: ({ children }) =>
        createElement(QueryClientProvider, { client: queryClient }, children),
    });

    // Clearing while signed-in pages are mounted refetches them without a session.
    const cachedAtNavigate: unknown[] = [];
    mockNavigate.mockImplementation(async () => {
      cachedAtNavigate.push(queryClient.getQueryData(['notifications']));
    });

    result.current();
    await signOut.mock.calls[0]?.[0].fetchOptions.onSuccess();

    expect(cachedAtNavigate).toEqual([{ items: [] }]);

    expect(queryClient.getQueryData(['notifications'])).toBeUndefined();
    expect(
      window.localStorage.getItem(`${STORAGE_PREFIX}:church-a:user-a`),
    ).toBeNull();
    expect(window.localStorage.getItem(myScheduleKey)).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/login',
      search: undefined,
    });
  });
});
