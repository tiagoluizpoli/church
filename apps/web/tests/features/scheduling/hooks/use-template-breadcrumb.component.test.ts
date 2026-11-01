import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTemplateBreadcrumb } from '@/features/scheduling/hooks/use-template-breadcrumb';
import { adminApi } from '@/utils/api-instances';

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    getEventTemplate: vi.fn(),
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

const mockedGetEventTemplate = vi.mocked(adminApi.getEventTemplate);

function renderTemplateBreadcrumb() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useTemplateBreadcrumb(), {
    wrapper: ({ children }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  });
}

describe('useTemplateBreadcrumb', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('labels the template segment with its saved name', async () => {
    mockedUseParams.mockReturnValue({ templateId: 'template-1' });
    mockedGetEventTemplate.mockResolvedValue({
      id: 'template-1',
      churchId: 'church-1',
      name: 'Culto de domingo',
      weekday: 0,
      blocks: [],
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    });

    const { result } = renderTemplateBreadcrumb();

    await waitFor(() =>
      expect(result.current).toEqual({
        segment: 'template-1',
        label: 'Culto de domingo',
      }),
    );
  });

  it('stays out of routes without a templateId', () => {
    mockedUseParams.mockReturnValue({});

    const { result } = renderTemplateBreadcrumb();

    expect(result.current).toBeNull();
    expect(mockedGetEventTemplate).not.toHaveBeenCalled();
  });
});
