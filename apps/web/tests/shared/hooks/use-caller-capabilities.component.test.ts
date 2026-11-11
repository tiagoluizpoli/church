import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CallerCapabilitiesScopeProvider } from '@/shared/components/caller-capabilities-scope';
import { useCallerCapabilities } from '@/shared/hooks/use-caller-capabilities';
import { callerCapabilitiesApi } from '@/utils/api-instances';

vi.mock('@/utils/api-instances', () => ({
  callerCapabilitiesApi: {
    getCallerCapabilities: vi.fn(),
  },
}));

const mockedGetCallerCapabilities = vi.mocked(
  callerCapabilitiesApi.getCallerCapabilities,
);

function renderCallerCapabilities() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useCallerCapabilities(), {
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

const CHURCH_ID = '11111111-1111-4111-8111-111111111111';

describe('useCallerCapabilities', () => {
  it('assumes every capability false while the query is still resolving', () => {
    mockedGetCallerCapabilities.mockReturnValue(new Promise(() => {}));

    const { result } = renderCallerCapabilities();

    expect(result.current).toEqual({
      isChurchAdmin: false,
      leadsMinistries: false,
      hasVolunteerMembership: false,
      ledMinistryIds: [],
      isResolving: true,
      isError: false,
      retry: expect.any(Function),
    });
  });

  it('exposes the server projection once resolved', async () => {
    mockedGetCallerCapabilities.mockResolvedValue({
      churchId: CHURCH_ID,
      isChurchAdmin: true,
      ledMinistries: [{ ministryId: 'm1', name: 'Louvor' }],
      hasVolunteerMembership: true,
    });

    const { result } = renderCallerCapabilities();

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current).toEqual({
      isChurchAdmin: true,
      leadsMinistries: true,
      hasVolunteerMembership: true,
      ledMinistryIds: ['m1'],
      isResolving: false,
      isError: false,
      retry: expect.any(Function),
    });
  });

  it('reports no ledMinistries as leadsMinistries false', async () => {
    mockedGetCallerCapabilities.mockResolvedValue({
      churchId: CHURCH_ID,
      isChurchAdmin: false,
      ledMinistries: [],
      hasVolunteerMembership: false,
    });

    const { result } = renderCallerCapabilities();

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.leadsMinistries).toBe(false);
  });

  it('fails closed and reports the error when the capability query fails', async () => {
    mockedGetCallerCapabilities.mockRejectedValue(new Error('Unavailable'));

    const { result } = renderCallerCapabilities();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current).toEqual({
      isChurchAdmin: false,
      leadsMinistries: false,
      hasVolunteerMembership: false,
      ledMinistryIds: [],
      isResolving: false,
      isError: true,
      retry: expect.any(Function),
    });
  });

  it('retry re-reads the projection and recovers', async () => {
    mockedGetCallerCapabilities.mockRejectedValueOnce(new Error('Unavailable'));
    mockedGetCallerCapabilities.mockResolvedValueOnce({
      churchId: CHURCH_ID,
      isChurchAdmin: true,
      ledMinistries: [],
      hasVolunteerMembership: false,
    });

    const { result } = renderCallerCapabilities();
    await waitFor(() => expect(result.current.isError).toBe(true));
    result.current.retry();

    await waitFor(() => expect(result.current.isChurchAdmin).toBe(true));
    expect(result.current.isError).toBe(false);
  });

  it('fails closed when the projection belongs to another Church', async () => {
    mockedGetCallerCapabilities.mockResolvedValue({
      churchId: 'other-church',
      isChurchAdmin: true,
      ledMinistries: [],
      hasVolunteerMembership: true,
    });

    const { result } = renderCallerCapabilities();

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.isChurchAdmin).toBe(false);
    expect(result.current.hasVolunteerMembership).toBe(false);
    expect(result.current.isError).toBe(true);
  });
});
