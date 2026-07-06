import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useCallerRoles } from './use-caller-roles';
import { adminApi } from '@/utils/api-instances';

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    listMinistries: vi.fn(),
  },
}));

const mockedListMinistries = vi.mocked(adminApi.listMinistries);

function renderCallerRoles() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useCallerRoles(), {
    wrapper: ({ children }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  });
}

describe('useCallerRoles', () => {
  it('assumes hidden while the gating query is still resolving', () => {
    mockedListMinistries.mockReturnValue(new Promise(() => {}));

    const { result } = renderCallerRoles();

    expect(result.current).toEqual({
      canSeeScheduling: false,
      isResolving: true,
    });
  });

  it('reveals Scheduling once the role-gated query succeeds', async () => {
    mockedListMinistries.mockResolvedValue({ ministries: [] });

    const { result } = renderCallerRoles();

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.canSeeScheduling).toBe(true);
  });

  it('keeps Scheduling hidden when the role-gated query is forbidden (403)', async () => {
    mockedListMinistries.mockRejectedValue(
      Object.assign(new Error('Forbidden'), {
        isAxiosError: true,
        response: { status: 403 },
      }),
    );

    const { result } = renderCallerRoles();

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.canSeeScheduling).toBe(false);
  });
});
