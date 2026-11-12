import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMinistryList } from '@/features/ministries/ministry-queries';
import { useMinistryBreadcrumb } from '@/features/scheduling/hooks/use-ministry-breadcrumb';
import { CallerCapabilitiesScopeProvider } from '@/shared/components/caller-capabilities-scope';
import { adminApi } from '@/utils/api-instances';

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    listMinistries: vi.fn(),
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

const mockedListMinistries = vi.mocked(adminApi.listMinistries);

function renderMinistryBreadcrumb() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useMinistryBreadcrumb(), {
    wrapper: ({ children }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  });
}

describe('useMinistryBreadcrumb', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('resolves the ministry name when the route matches with a ministryId param', async () => {
    mockedUseParams.mockReturnValue({ ministryId: 'ministry-1' });
    mockedListMinistries.mockResolvedValue({
      ministries: [
        {
          id: 'ministry-1',
          churchId: 'church-1',
          name: 'Greeters',
          defaultDirection: 'all_out',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
    });

    const { result } = renderMinistryBreadcrumb();

    await waitFor(() =>
      expect(result.current).toEqual({
        segment: 'ministry-1',
        label: 'Greeters',
      }),
    );
    expect(mockedListMinistries).toHaveBeenCalled();
  });

  it('shares accessible ministries with management and isolates Church switches', async () => {
    mockedUseParams.mockReturnValue({ ministryId: 'ministry-1' });
    mockedListMinistries
      .mockResolvedValueOnce({
        ministries: [
          {
            id: 'ministry-1',
            churchId: 'church-1',
            name: 'Greeters',
            defaultDirection: 'all_out',
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({ ministries: [] })
      .mockRejectedValueOnce(new Error('forbidden'));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    let churchId = 'church-1';
    const { result, rerender } = renderHook(
      () => ({
        breadcrumb: useMinistryBreadcrumb(),
        list: useMinistryList({ enabled: true }),
      }),
      {
        wrapper: ({ children }) =>
          createElement(
            QueryClientProvider,
            { client: queryClient },
            createElement(
              CallerCapabilitiesScopeProvider,
              { churchId, userId: 'user-1' },
              children,
            ),
          ),
      },
    );

    await waitFor(() =>
      expect(result.current.breadcrumb?.label).toBe('Greeters'),
    );
    expect(result.current.list.data?.ministries[0]?.name).toBe('Greeters');
    expect(mockedListMinistries).toHaveBeenCalledTimes(1);

    churchId = 'church-2';
    rerender();
    await waitFor(() =>
      expect(result.current.list.data?.ministries).toEqual([]),
    );
    expect(result.current.breadcrumb).toBeNull();
    expect(mockedListMinistries).toHaveBeenCalledTimes(2);

    churchId = 'church-3';
    rerender();
    await waitFor(() => expect(result.current.list.isError).toBe(true));
    expect(result.current.list.data).toBeUndefined();
    expect(result.current.breadcrumb).toBeNull();
    expect(mockedListMinistries).toHaveBeenCalledTimes(3);
  });

  it('returns null when the matched route has no ministryId param', () => {
    mockedUseParams.mockReturnValue({});

    const { result } = renderMinistryBreadcrumb();

    expect(result.current).toBeNull();
    expect(mockedListMinistries).not.toHaveBeenCalled();
  });

  it('returns null when the ministryId does not match any fetched ministry', async () => {
    mockedUseParams.mockReturnValue({ ministryId: 'unknown-ministry' });
    mockedListMinistries.mockResolvedValue({
      ministries: [
        {
          id: 'ministry-1',
          churchId: 'church-1',
          name: 'Greeters',
          defaultDirection: 'all_out',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
    });

    const { result } = renderMinistryBreadcrumb();

    await waitFor(() => expect(mockedListMinistries).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
