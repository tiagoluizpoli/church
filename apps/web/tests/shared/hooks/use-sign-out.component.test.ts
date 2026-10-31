import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useSignOut } from '@/shared/hooks/use-sign-out';
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
  it('drops the cached inbox from the query cache and storage once signed out', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['notifications'], { items: [] });
    window.localStorage.setItem(`${STORAGE_PREFIX}:church-a:user-a`, '[]');
    const { result } = renderHook(() => useSignOut(), {
      wrapper: ({ children }) =>
        createElement(QueryClientProvider, { client: queryClient }, children),
    });

    result.current();
    signOut.mock.calls[0]?.[0].fetchOptions.onSuccess();

    expect(queryClient.getQueryData(['notifications'])).toBeUndefined();
    expect(
      window.localStorage.getItem(`${STORAGE_PREFIX}:church-a:user-a`),
    ).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/login',
      search: undefined,
    });
  });
});
