import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  type ActiveChurchSwitchedMessage,
  subscribeToActiveChurchSwitch,
} from './active-church-broadcast';
import {
  getActiveChurchDestination,
  switchActiveChurch,
} from './active-church-switch';

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
      '/dashboard?section=availability#today',
      '/dashboard?section=availability#today',
    ],
    ['/notifications', '/dashboard'],
    ['/volunteer/availability', '/dashboard'],
    ['/scheduling/planning-cycles', '/scheduling/planning-cycles'],
    ['/scheduling/planning-cycles/', '/scheduling/planning-cycles/'],
    ['/scheduling/tailoring/', '/scheduling/tailoring/'],
    ['/scheduling/planning-cycles/cycle-1', '/dashboard'],
    ['/scheduling/', '/dashboard'],
    ['/scheduling/tailoring/ministry-1', '/dashboard'],
    ['/unrecognized-route', '/dashboard'],
    ['https://untrusted.example/dashboard', '/dashboard'],
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
        destination: '/scheduling/planning-cycles?view=board#upcoming',
      }),
    ).toBe('/dashboard');
  });

  it('preserves /dashboard with its query and hash when the target has the dashboard area', () => {
    expect(
      getActiveChurchDestination({
        availableAreas: ['dashboard'],
        destination: '/dashboard?section=availability#today',
      }),
    ).toBe('/dashboard?section=availability#today');
  });

  it('falls back and drops query/hash when the target lacks the dashboard area', () => {
    expect(
      getActiveChurchDestination({
        availableAreas: ['scheduling'],
        destination: '/dashboard?section=availability#today',
      }),
    ).toBe('/dashboard');
  });

  it('preserves a scheduling collection route when the target has only the scheduling area', () => {
    expect(
      getActiveChurchDestination({
        availableAreas: ['scheduling'],
        destination: '/scheduling/planning-cycles?view=board#upcoming',
      }),
    ).toBe('/scheduling/planning-cycles?view=board#upcoming');
  });

  it('falls back to the dashboard when the target has neither area', () => {
    expect(
      getActiveChurchDestination({
        availableAreas: [],
        destination: '/scheduling/tailoring/',
      }),
    ).toBe('/dashboard');
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
      destination: '/dashboard?section=availability',
      navigate,
      queryClient,
      selectActiveChurch,
    });

    expect(cancelQueries).toHaveBeenCalledOnce();
    expect(removeQueries).toHaveBeenCalledOnce();
    expect(selectActiveChurch).toHaveBeenCalledWith({ churchId: 'church-b' });
    expect(navigate).toHaveBeenCalledWith({
      destination: '/dashboard?section=availability',
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
      destination: '/scheduling/tailoring/ministry-1',
      navigate,
      queryClient,
      selectActiveChurch,
    });

    expect(navigate).toHaveBeenCalledWith({ destination: '/dashboard' });
  });

  it('removes Church-scoped data without removing selector data', async () => {
    const { queryClient, selectActiveChurch, navigate } =
      createSwitchTestDependencies();
    queryClient.setQueryData(['planning-cycles'], { church: 'church-a' });
    queryClient.setQueryData(['active-church', 'options'], {
      churches: ['church-a', 'church-b'],
    });

    await switchActiveChurch({
      availableAreas: ['dashboard'],
      churchId: 'church-b',
      churchName: 'Igreja Central',
      destination: '/dashboard',
      navigate,
      queryClient,
      selectActiveChurch,
    });

    expect(queryClient.getQueryData(['planning-cycles'])).toBeUndefined();
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
        destination: '/dashboard',
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
});
