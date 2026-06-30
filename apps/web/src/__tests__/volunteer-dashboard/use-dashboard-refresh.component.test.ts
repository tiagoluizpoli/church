import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDashboardRefresh } from '@/features/volunteers/hooks/use-dashboard-refresh';

function setNavigatorOnlineState(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  });
}

const visibleDataFixture = {
  assignmentGroups: [{ eventId: 'event-1' }],
  availabilityTasks: [{ eventId: 'event-2' }],
  ministrySchedule: [{ eventId: 'event-3' }],
  notificationPages: [{ dateBucketLabel: 'Today', items: [] }],
};

describe('useDashboardRefresh', () => {
  afterEach(() => {
    setNavigatorOnlineState(true);
  });

  it('stays silent when visible dashboard data does not change', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ visibleData }) =>
        useDashboardRefresh({
          onRefresh,
          visibleData,
        }),
      {
        initialProps: {
          visibleData: visibleDataFixture,
        },
      },
    );

    rerender({
      visibleData: {
        ...visibleDataFixture,
      },
    });

    expect(result.current.hasBackgroundUpdate).toBe(false);
  });

  it('shows background update indicator when visible dashboard data changes', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ visibleData }) =>
        useDashboardRefresh({
          onRefresh,
          visibleData,
        }),
      {
        initialProps: {
          visibleData: visibleDataFixture,
        },
      },
    );

    rerender({
      visibleData: {
        ...visibleDataFixture,
        assignmentGroups: [{ eventId: 'event-1' }, { eventId: 'event-4' }],
      },
    });

    expect(result.current.hasBackgroundUpdate).toBe(true);

    act(() => {
      result.current.dismissBackgroundUpdate();
    });

    expect(result.current.hasBackgroundUpdate).toBe(false);
  });

  it('keeps cached mode active when browser is offline', async () => {
    setNavigatorOnlineState(false);
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useDashboardRefresh({
        onRefresh,
        visibleData: visibleDataFixture,
      }),
    );

    expect(result.current.isOnline).toBe(false);
    expect(result.current.isUsingCachedData).toBe(true);

    await act(async () => {
      await result.current.refresh();
    });

    expect(onRefresh).not.toHaveBeenCalled();
    expect(result.current.refreshState).toBe('error');
  });
});
