import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useActiveChurchTabSync } from './use-active-church-tab-sync';
import { postActiveChurchSwitched } from '@/shared/utils/active-church-broadcast';

let mockHref = '/dashboard';
const mockNavigate = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ href: mockHref }),
  useNavigate: () => mockNavigate,
}));

function renderTabSync(queryClient: QueryClient) {
  return renderHook(() => useActiveChurchTabSync(), {
    wrapper: ({ children }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  });
}

describe('useActiveChurchTabSync', () => {
  it('starts with no pending switch', () => {
    const queryClient = new QueryClient();
    const { result } = renderTabSync(queryClient);

    expect(result.current.pendingSwitch).toBeNull();
  });

  it('surfaces a pending switch and cancels Church-scoped queries when another tab switches', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['planning-cycles'], { church: 'church-a' });
    const cancelQueries = vi.spyOn(queryClient, 'cancelQueries');
    const { result } = renderTabSync(queryClient);

    act(() => {
      postActiveChurchSwitched({
        availableAreas: ['dashboard'],
        churchId: 'church-b',
        churchName: 'Igreja Central',
      });
    });

    await waitFor(() =>
      expect(result.current.pendingSwitch).toEqual({
        availableAreas: ['dashboard'],
        churchId: 'church-b',
        churchName: 'Igreja Central',
      }),
    );
    expect(cancelQueries).toHaveBeenCalled();
  });

  it('clears cache, navigates per route policy, and dismisses the block on continue', async () => {
    mockHref = '/scheduling/planning-cycles?view=board';
    const queryClient = new QueryClient();
    queryClient.setQueryData(['planning-cycles'], { church: 'church-a' });
    const { result } = renderTabSync(queryClient);

    act(() => {
      postActiveChurchSwitched({
        availableAreas: ['dashboard'],
        churchId: 'church-b',
        churchName: 'Igreja Central',
      });
    });
    await waitFor(() => expect(result.current.pendingSwitch).not.toBeNull());

    await act(async () => {
      await result.current.continueSwitch();
    });

    expect(queryClient.getQueryData(['planning-cycles'])).toBeUndefined();
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/dashboard' });
    expect(result.current.pendingSwitch).toBeNull();
  });
});
