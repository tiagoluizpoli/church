import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCycleBreadcrumb } from '@/features/scheduling/hooks/use-cycle-breadcrumb';
import { adminApi } from '@/utils/api-instances';

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    getCycle: vi.fn(),
  },
}));

const mockedUseParams = vi.fn();

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>(
    '@tanstack/react-router',
  );
  return {
    ...actual,
    useParams: () => mockedUseParams(),
  };
});

const mockedGetCycle = vi.mocked(adminApi.getCycle);

function renderCycleBreadcrumb() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useCycleBreadcrumb(), {
    wrapper: ({ children }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  });
}

describe('useCycleBreadcrumb', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('resolves the cycle name when the route matches with a cycleId param', async () => {
    mockedUseParams.mockReturnValue({ cycleId: 'cycle-1' });
    mockedGetCycle.mockResolvedValue({
      cycle: {
        id: 'cycle-1',
        churchId: 'church-1',
        name: 'August 2026',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        state: 'draft',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
      events: [],
    });

    const { result } = renderCycleBreadcrumb();

    await waitFor(() =>
      expect(result.current).toEqual({
        segment: 'cycle-1',
        label: 'August 2026',
      }),
    );
    expect(mockedGetCycle).toHaveBeenCalledWith('cycle-1');
  });

  it('returns null when the matched route has no cycleId param', () => {
    mockedUseParams.mockReturnValue({});

    const { result } = renderCycleBreadcrumb();

    expect(result.current).toBeNull();
    expect(mockedGetCycle).not.toHaveBeenCalled();
  });
});
