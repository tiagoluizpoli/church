import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePlanningCycleBreadcrumb } from './use-planning-cycle-breadcrumb';
import { adminApi } from '@/utils/api-instances';

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    getPlanningCycle: vi.fn(),
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

const mockedGetPlanningCycle = vi.mocked(adminApi.getPlanningCycle);

function renderPlanningCycleBreadcrumb() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => usePlanningCycleBreadcrumb(), {
    wrapper: ({ children }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  });
}

describe('usePlanningCycleBreadcrumb', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('resolves the cycle name when the route matches with a cycleId param', async () => {
    mockedUseParams.mockReturnValue({ cycleId: 'cycle-1' });
    mockedGetPlanningCycle.mockResolvedValue({
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

    const { result } = renderPlanningCycleBreadcrumb();

    await waitFor(() =>
      expect(result.current).toEqual({
        segment: 'cycle-1',
        label: 'August 2026',
      }),
    );
    expect(mockedGetPlanningCycle).toHaveBeenCalledWith('cycle-1');
  });

  it('returns null when the matched route has no cycleId param', () => {
    mockedUseParams.mockReturnValue({});

    const { result } = renderPlanningCycleBreadcrumb();

    expect(result.current).toBeNull();
    expect(mockedGetPlanningCycle).not.toHaveBeenCalled();
  });
});
