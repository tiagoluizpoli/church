import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useCallerRoles } from './use-caller-roles';
import { schedulingCapabilitiesApi } from '@/utils/api-instances';

vi.mock('@/utils/api-instances', () => ({
  schedulingCapabilitiesApi: {
    getSchedulingCapability: vi.fn(),
  },
}));

const mockedGetSchedulingCapability = vi.mocked(
  schedulingCapabilitiesApi.getSchedulingCapability,
);

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
    mockedGetSchedulingCapability.mockReturnValue(new Promise(() => {}));

    const { result } = renderCallerRoles();

    expect(result.current).toEqual({
      canSeeScheduling: false,
      isResolving: true,
    });
  });

  it('reveals Scheduling when the server capability projection grants it', async () => {
    mockedGetSchedulingCapability.mockResolvedValue({
      canAccessScheduling: true,
    });

    const { result } = renderCallerRoles();

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.canSeeScheduling).toBe(true);
  });

  it('keeps Scheduling hidden when the server capability projection denies it', async () => {
    mockedGetSchedulingCapability.mockResolvedValue({
      canAccessScheduling: false,
    });

    const { result } = renderCallerRoles();

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.canSeeScheduling).toBe(false);
  });

  it('keeps Scheduling hidden when the capability query fails', async () => {
    mockedGetSchedulingCapability.mockRejectedValue(new Error('Unavailable'));

    const { result } = renderCallerRoles();

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.canSeeScheduling).toBe(false);
  });
});
