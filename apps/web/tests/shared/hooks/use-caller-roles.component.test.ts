import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CallerCapabilitiesScopeProvider } from '@/shared/components/caller-capabilities-scope';
import { useCallerRoles } from '@/shared/hooks/use-caller-roles';
import { callerCapabilitiesApi } from '@/utils/api-instances';

vi.mock('@/utils/api-instances', () => ({
  callerCapabilitiesApi: {
    getCallerCapabilities: vi.fn(),
  },
}));

const mockedGetCallerCapabilities = vi.mocked(
  callerCapabilitiesApi.getCallerCapabilities,
);

function renderCallerRoles() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useCallerRoles(), {
    wrapper: ({ children }) =>
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          CallerCapabilitiesScopeProvider,
          {
            churchId: '11111111-1111-4111-8111-111111111111',
            userId: 'user-id',
          },
          children,
        ),
      ),
  });
}

describe('useCallerRoles', () => {
  it('assumes hidden while the gating query is still resolving', () => {
    mockedGetCallerCapabilities.mockReturnValue(new Promise(() => {}));

    const { result } = renderCallerRoles();

    expect(result.current).toEqual({
      canSeeScheduling: false,
      isResolving: true,
    });
  });

  it('reveals Scheduling when the server capability projection grants it', async () => {
    mockedGetCallerCapabilities.mockResolvedValue({
      churchId: '11111111-1111-4111-8111-111111111111',
      isChurchAdmin: true,
      ledMinistries: [],
      hasVolunteerMembership: false,
    });

    const { result } = renderCallerRoles();

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.canSeeScheduling).toBe(true);
  });

  it('keeps Scheduling hidden when the server capability projection denies it', async () => {
    mockedGetCallerCapabilities.mockResolvedValue({
      churchId: '11111111-1111-4111-8111-111111111111',
      isChurchAdmin: false,
      ledMinistries: [],
      hasVolunteerMembership: false,
    });

    const { result } = renderCallerRoles();

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.canSeeScheduling).toBe(false);
  });

  it('keeps Scheduling hidden when the capability query fails', async () => {
    mockedGetCallerCapabilities.mockRejectedValue(new Error('Unavailable'));

    const { result } = renderCallerRoles();

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.canSeeScheduling).toBe(false);
  });
});
