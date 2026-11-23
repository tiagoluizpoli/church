import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  type ActiveChurchSwitchedMessage,
  subscribeToActiveChurchSwitch,
} from '@/shared/utils/active-church-broadcast';
import {
  clearActiveChurchScopedCache,
  getActiveChurchDestination,
  switchActiveChurch,
} from '@/shared/utils/active-church-switch';

interface SelectActiveChurchInput {
  churchId: string;
}

interface NavigateInput {
  destination: string;
}

type SelectActiveChurch = (input: SelectActiveChurchInput) => Promise<void>;
type Navigate = (input: NavigateInput) => Promise<void>;

interface SwitchTestDependencies {
  queryClient: QueryClient;
  selectActiveChurch: ReturnType<typeof vi.fn<SelectActiveChurch>>;
  navigate: ReturnType<typeof vi.fn<Navigate>>;
}

function createSwitchTestDependencies(): SwitchTestDependencies {
  return {
    queryClient: new QueryClient(),
    selectActiveChurch: vi
      .fn<SelectActiveChurch>()
      .mockResolvedValue(undefined),
    navigate: vi.fn<Navigate>().mockResolvedValue(undefined),
  };
}

describe('active Church route policy', () => {
  it.each([
    [
      '/app/dashboard?section=availability#today',
      '/app/dashboard?section=availability#today',
    ],
    ['/app/notifications', '/app'],
    ['/app/cycles', '/app/cycles'],
    ['/app/cycles/', '/app/cycles/'],
    ['/app/schedules/', '/app/schedules/'],
    ['/app/event-templates', '/app/event-templates'],
    ['/app/schedules/ministry-1/cycle-1/assign', '/app'],
    ['/app/cycles/cycle-1', '/app'],
    ['/scheduling/', '/app'],
    ['/app/schedules/ministry-1', '/app'],
    ['/unrecognized-route', '/app'],
    ['https://untrusted.example/dashboard', '/app'],
  ])('resolves %s to %s', (destination, expectedDestination) => {
    expect(
      getActiveChurchDestination({
        availableAreas: ['dashboard', 'scheduling'],
        destination,
      }),
    ).toBe(expectedDestination);
  });

  it('falls back when the target Church lacks the preserved route capability', () => {
    expect(
      getActiveChurchDestination({
        availableAreas: ['dashboard'],
        destination: '/app/cycles?view=board#upcoming',
      }),
    ).toBe('/app');
  });

  it('preserves /dashboard with its query and hash when the target has the dashboard area', () => {
    expect(
      getActiveChurchDestination({
        availableAreas: ['dashboard'],
        destination: '/app/dashboard?section=availability#today',
      }),
    ).toBe('/app/dashboard?section=availability#today');
  });

  it('falls back and drops query/hash when the target lacks the dashboard area', () => {
    expect(
      getActiveChurchDestination({
        availableAreas: ['scheduling'],
        destination: '/app/dashboard?section=availability#today',
      }),
    ).toBe('/app');
  });

  it('preserves a scheduling collection route when the target has only the scheduling area', () => {
    expect(
      getActiveChurchDestination({
        availableAreas: ['scheduling'],
        destination: '/app/cycles?view=board#upcoming',
      }),
    ).toBe('/app/cycles?view=board#upcoming');
  });

  it('falls back to the dashboard when the target has neither area', () => {
    expect(
      getActiveChurchDestination({
        availableAreas: [],
        destination: '/app/schedules/',
      }),
    ).toBe('/app');
  });
});

describe('switchActiveChurch', () => {
  it('cancels and removes cached Church-scoped data before selecting and navigating', async () => {
    const { queryClient, selectActiveChurch, navigate } =
      createSwitchTestDependencies();
    const calls: string[] = [];
    const cancelQueries = vi
      .spyOn(queryClient, 'cancelQueries')
      .mockImplementation(async () => {
        calls.push('cancel');
      });
    const removeQueries = vi
      .spyOn(queryClient, 'removeQueries')
      .mockImplementation(() => {
        calls.push('remove');
      });
    selectActiveChurch.mockImplementation(async () => {
      calls.push('select');
    });
    navigate.mockImplementation(async () => {
      calls.push('navigate');
    });

    await switchActiveChurch({
      availableAreas: ['dashboard'],
      churchId: 'church-b',
      churchName: 'Igreja Central',
      destination: '/app/dashboard?section=availability',
      navigate,
      queryClient,
      selectActiveChurch,
    });

    expect(cancelQueries).toHaveBeenCalledOnce();
    expect(removeQueries).toHaveBeenCalledOnce();
    expect(selectActiveChurch).toHaveBeenCalledWith({ churchId: 'church-b' });
    expect(navigate).toHaveBeenCalledWith({
      destination: '/app/dashboard?section=availability',
    });
    expect(calls).toEqual(['cancel', 'remove', 'select', 'navigate']);
  });

  it('falls back to the dashboard for a route without a preserve declaration', async () => {
    const { queryClient, selectActiveChurch, navigate } =
      createSwitchTestDependencies();

    await switchActiveChurch({
      availableAreas: ['dashboard'],
      churchId: 'church-b',
      churchName: 'Igreja Central',
      destination: '/app/schedules/ministry-1',
      navigate,
      queryClient,
      selectActiveChurch,
    });

    expect(navigate).toHaveBeenCalledWith({ destination: '/app' });
  });

  it('removes Church-scoped data without removing selector data', async () => {
    const { queryClient, selectActiveChurch, navigate } =
      createSwitchTestDependencies();
    queryClient.setQueryData(['cycles'], { church: 'church-a' });
    queryClient.setQueryData(['home', 'church', 'church-a', 'u1'], { a: 1 });
    queryClient.setQueryData(['active-church', 'options'], {
      churches: ['church-a', 'church-b'],
    });

    await switchActiveChurch({
      availableAreas: ['dashboard'],
      churchId: 'church-b',
      churchName: 'Igreja Central',
      destination: '/app/dashboard',
      navigate,
      queryClient,
      selectActiveChurch,
    });

    expect(queryClient.getQueryData(['cycles'])).toBeUndefined();
    expect(
      queryClient.getQueryData(['home', 'church', 'church-a', 'u1']),
    ).toBeUndefined();
    expect(queryClient.getQueryData(['active-church', 'options'])).toEqual({
      churches: ['church-a', 'church-b'],
    });
  });

  it('broadcasts the switch to other tabs after selecting, before navigating', async () => {
    const { queryClient, selectActiveChurch, navigate } =
      createSwitchTestDependencies();
    const received: ActiveChurchSwitchedMessage[] = [];
    const unsubscribe = subscribeToActiveChurchSwitch({
      onMessage: (message) => received.push(message),
    });

    try {
      await switchActiveChurch({
        availableAreas: ['dashboard'],
        churchId: 'church-b',
        churchName: 'Igreja Central',
        destination: '/app/dashboard',
        navigate,
        queryClient,
        selectActiveChurch,
      });

      await vi.waitFor(() => expect(received).toHaveLength(1));
      expect(received[0]).toEqual({
        availableAreas: ['dashboard'],
        churchId: 'church-b',
        churchName: 'Igreja Central',
      });
    } finally {
      unsubscribe();
    }
  });

  it('propagates a rejected selection without broadcasting or navigating', async () => {
    const { queryClient, selectActiveChurch, navigate } =
      createSwitchTestDependencies();
    const selectionError = new Error('session save failed');
    selectActiveChurch.mockRejectedValue(selectionError);
    queryClient.setQueryData(['cycles'], { church: 'church-a' });
    const received: ActiveChurchSwitchedMessage[] = [];
    const unsubscribe = subscribeToActiveChurchSwitch({
      onMessage: (message) => received.push(message),
    });

    try {
      await expect(
        switchActiveChurch({
          availableAreas: ['dashboard'],
          churchId: 'church-b',
          churchName: 'Igreja Central',
          destination: '/app/dashboard',
          navigate,
          queryClient,
          selectActiveChurch,
        }),
      ).rejects.toBe(selectionError);

      // The former Church's data is still evicted; only the switch itself must not happen.
      expect(queryClient.getQueryData(['cycles'])).toBeUndefined();
      expect(navigate).not.toHaveBeenCalled();
      // BroadcastChannel delivers asynchronously; give a stray message time to land.
      const settleWindow = new Promise((resolve) => setTimeout(resolve, 50));
      await settleWindow;
      expect(received).toEqual([]);
    } finally {
      unsubscribe();
    }
  });
});

describe('clearActiveChurchScopedCache', () => {
  it('keeps the active-church and mounted redemption queries, removes the rest', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['active-church'], 1);
    queryClient.setQueryData(['redemption', 'church-invitation', 'i1'], 2);
    queryClient.setQueryData(['schedules'], 3);

    await clearActiveChurchScopedCache({ queryClient });

    expect(queryClient.getQueryData(['active-church'])).toBe(1);
    expect(
      queryClient.getQueryData(['redemption', 'church-invitation', 'i1']),
    ).toBe(2);
    expect(queryClient.getQueryData(['schedules'])).toBeUndefined();
  });
});
